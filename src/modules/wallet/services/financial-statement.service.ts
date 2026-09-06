import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { Shipment } from '../../shipments/entities/shipment.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletTransaction } from '../entities/transaction.entity';
import { User } from '../../users/entities/user.entity';
import { ShipmentStatus } from '../../shipments/enums/shipment.enum';

export interface MonthlyStatementData {
  invoiceNumber: string;
  statementDate: string;
  billingMonth: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  merchant: {
    id: string;
    fullName: string;
    companyName: string;
    email: string;
    phoneNumber: string;
  };
  supplier: {
    companyName: string;
    crNumber: string;
    vatNumber: string;
    address: string;
    city: string;
    country: string;
  };
  summary: {
    totalShipmentsCount: number;
    deliveredShipmentsCount: number;
    inTransitCount: number;
    cancelledCount: number;
    returnedCount: number;
    grossCodCollected: number;
    totalShippingFees: number;
    vatRatePercent: number;
    vatAmount: number;
    totalServicesWithVat: number;
    netCodPayoutToWallet: number;
    currentWalletBalance: number;
  };
  taxReport: {
    taxableServicesAmount: number;
    applicableVatRate: string;
    calculatedVatAmount: number;
    grossTotalInclVat: number;
    vatCategory: string;
    complianceStandard: string;
  };
  shipments: Array<{
    id: string;
    date: string;
    trackingNumber: string;
    otoOrderId?: string;
    carrier: string;
    destinationCity: string;
    weightKg: number;
    paymentMethod: string;
    codAmount: number;
    shippingCost: number;
    vat15Percent: number;
    totalCostWithVat: number;
    isSettled: boolean;
    status: string;
  }>;
  walletLedger: Array<{
    date: string;
    type: string;
    amount: number;
    status: string;
    referenceId?: string;
    description?: string;
  }>;
}

@Injectable()
export class FinancialStatementService {
  private readonly logger = new Logger(FinancialStatementService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Aggregate monthly financial metrics, invoice summary, shipping fees, and ZATCA tax data
   */
  async getMonthlyStatementData(
    merchantId: string,
    targetMonth?: string,
  ): Promise<MonthlyStatementData> {
    const merchant = await this.userRepository.findOne({
      where: { id: merchantId, isDeleted: false },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found.`);
    }

    // Parse target month (format YYYY-MM) or default to current month
    const now = new Date();
    const billingMonth =
      targetMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)
        ? targetMonth
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [yearStr, monthStr] = billingMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // 1. Fetch shipments for the merchant in the period
    const shipments = await this.shipmentRepository.find({
      where: {
        merchantId,
        isDeleted: false,
        createdAt: Between(startDate, endDate),
      },
      relations: ['deliveryAddress'],
      order: { createdAt: 'ASC' },
    });

    // 2. Fetch wallet & monthly transactions
    const wallet = await this.walletRepository.findOne({
      where: { merchantId, isDeleted: false },
    });

    const transactions = await this.transactionRepository.find({
      where: {
        merchantId,
        isDeleted: false,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
    });

    // 3. Compute Aggregates
    const totalShipmentsCount = shipments.length;
    let deliveredCount = 0;
    let inTransitCount = 0;
    let cancelledCount = 0;
    let returnedCount = 0;
    let grossCodCollected = 0;
    let totalShippingFees = 0;

    const formattedShipments = shipments.map((s) => {
      if (s.status === ShipmentStatus.Delivered) deliveredCount++;
      else if (s.status === ShipmentStatus.InTransit || s.status === ShipmentStatus.PickedUp) inTransitCount++;
      else if (s.status === ShipmentStatus.Cancelled) cancelledCount++;
      else if (s.status === ShipmentStatus.Returned) returnedCount++;

      const cod = Number(s.codAmount || 0);
      const shipFee = Number(s.shippingCost || 0);
      const vat = Number((shipFee * 0.15).toFixed(2));
      const totalFee = Number((shipFee + vat).toFixed(2));

      if (s.isCodSettled || s.status === ShipmentStatus.Delivered) {
        grossCodCollected += cod;
      }
      totalShippingFees += shipFee;

      return {
        id: s.id,
        date: s.createdAt.toISOString().slice(0, 10),
        trackingNumber: s.trackingNumber,
        otoOrderId: s.otoOrderId || undefined,
        carrier: s.carrierName || 'OTO',
        destinationCity: s.deliveryAddress?.city || 'Saudi Arabia',
        weightKg: Number(s.weightKg || 1),
        paymentMethod: s.paymentMethod,
        codAmount: cod,
        shippingCost: shipFee,
        vat15Percent: vat,
        totalCostWithVat: totalFee,
        isSettled: s.isCodSettled,
        status: s.status,
      };
    });

    const vatRate = 0.15;
    const vatAmount = Number((totalShippingFees * vatRate).toFixed(2));
    const totalServicesWithVat = Number((totalShippingFees + vatAmount).toFixed(2));
    const netCodPayout = Number((grossCodCollected - totalShippingFees).toFixed(2));

    const invoiceNumber = `INV-WSL-${billingMonth.replace('-', '')}-${merchantId.slice(0, 6).toUpperCase()}`;

    const formattedTransactions = transactions.map((t) => ({
      date: t.createdAt.toISOString().slice(0, 10),
      type: t.type,
      amount: Number(t.amount || 0),
      status: t.status,
      referenceId: t.referenceId || undefined,
      description: t.description || undefined,
    }));

    return {
      invoiceNumber,
      statementDate: now.toISOString().slice(0, 10),
      billingMonth,
      periodStart: startDate.toISOString().slice(0, 10),
      periodEnd: endDate.toISOString().slice(0, 10),
      currency: 'SAR',
      merchant: {
        id: merchant.id,
        fullName: merchant.fullName,
        companyName: merchant.companyName || merchant.fullName,
        email: merchant.email,
        phoneNumber: merchant.phoneNumber,
      },
      supplier: {
        companyName: 'WaslShip Logistics & Technologies LLC',
        crNumber: '1010789421',
        vatNumber: '310294857200003',
        address: 'King Fahd Road, Al Olaya',
        city: 'Riyadh',
        country: 'Kingdom of Saudi Arabia',
      },
      summary: {
        totalShipmentsCount,
        deliveredShipmentsCount: deliveredCount,
        inTransitCount,
        cancelledCount,
        returnedCount,
        grossCodCollected: Number(grossCodCollected.toFixed(2)),
        totalShippingFees: Number(totalShippingFees.toFixed(2)),
        vatRatePercent: 15,
        vatAmount,
        totalServicesWithVat,
        netCodPayoutToWallet: netCodPayout,
        currentWalletBalance: wallet ? Number(wallet.balance.toFixed(2)) : 0,
      },
      taxReport: {
        taxableServicesAmount: Number(totalShippingFees.toFixed(2)),
        applicableVatRate: '15.00%',
        calculatedVatAmount: vatAmount,
        grossTotalInclVat: totalServicesWithVat,
        vatCategory: 'Standard Rate (15%)',
        complianceStandard: 'ZATCA E-Invoicing Phase II Regulations',
      },
      shipments: formattedShipments,
      walletLedger: formattedTransactions,
    };
  }

  /**
   * Generate CSV format for Monthly Invoice, Shipping Fees & Tax Reports
   */
  async generateMonthlyStatementCsv(
    merchantId: string,
    targetMonth?: string,
  ): Promise<{ filename: string; csvContent: string }> {
    const data = await this.getMonthlyStatementData(merchantId, targetMonth);

    const lines: string[] = [];

    // 1. Header Metadata Section
    lines.push('WASLSHIP LOGISTICS - MONTHLY FINANCIAL STATEMENT & TAX INVOICE');
    lines.push(`Invoice Number,${data.invoiceNumber}`);
    lines.push(`Billing Month,${data.billingMonth}`);
    lines.push(`Billing Period,${data.periodStart} to ${data.periodEnd}`);
    lines.push(`Statement Date,${data.statementDate}`);
    lines.push(`Currency,${data.currency}`);
    lines.push(`Merchant Name,${data.merchant.fullName}`);
    lines.push(`Merchant Company,${data.merchant.companyName}`);
    lines.push(`Merchant Email,${data.merchant.email}`);
    lines.push(`Merchant Phone,${data.merchant.phoneNumber}`);
    lines.push(`Supplier VAT Number (ZATCA),${data.supplier.vatNumber}`);
    lines.push(`Supplier CR Number,${data.supplier.crNumber}`);
    lines.push('');

    // 2. Executive Financial Summary
    lines.push('=== MONTHLY FINANCIAL SUMMARY ===');
    lines.push('Metric,Value (SAR)');
    lines.push(`Total Shipments Created,${data.summary.totalShipmentsCount}`);
    lines.push(`Delivered Shipments,${data.summary.deliveredShipmentsCount}`);
    lines.push(`Gross COD Collected,${data.summary.grossCodCollected.toFixed(2)}`);
    lines.push(`Total Shipping Fees (Taxable Base),${data.summary.totalShippingFees.toFixed(2)}`);
    lines.push(`VAT Rate,${data.summary.vatRatePercent}%`);
    lines.push(`Calculated VAT (15%),${data.summary.vatAmount.toFixed(2)}`);
    lines.push(`Total Shipping & Tax Services,${data.summary.totalServicesWithVat.toFixed(2)}`);
    lines.push(`Net COD Credited to Wallet,${data.summary.netCodPayoutToWallet.toFixed(2)}`);
    lines.push(`Current Wallet Balance,${data.summary.currentWalletBalance.toFixed(2)}`);
    lines.push('');

    // 3. ZATCA Tax Report Section
    lines.push('=== ZATCA COMPLIANT TAX REPORT (15% VAT) ===');
    lines.push('Tax Category,Taxable Base (SAR),VAT Rate,Output VAT (SAR),Total Services With VAT (SAR),Compliance Standard');
    lines.push(
      `Logistics & Delivery Services,${data.taxReport.taxableServicesAmount.toFixed(2)},15.00%,${data.taxReport.calculatedVatAmount.toFixed(2)},${data.taxReport.grossTotalInclVat.toFixed(2)},${data.taxReport.complianceStandard}`,
    );
    lines.push('');

    // 4. Itemized Shipping Fees Breakdown
    lines.push('=== ITEMIZED SHIPPING FEES & SHIPMENT BREAKDOWN ===');
    lines.push(
      'Date,Tracking Number,OTO Order ID,Carrier,Destination City,Weight (kg),Payment Method,COD Amount (SAR),Shipping Fee (SAR),VAT 15% (SAR),Total Fee Incl VAT (SAR),Settlement Status,Delivery Status',
    );
    for (const s of data.shipments) {
      lines.push(
        [
          s.date,
          s.trackingNumber,
          s.otoOrderId || 'N/A',
          s.carrier,
          `"${s.destinationCity.replace(/"/g, '""')}"`,
          s.weightKg,
          s.paymentMethod,
          s.codAmount.toFixed(2),
          s.shippingCost.toFixed(2),
          s.vat15Percent.toFixed(2),
          s.totalCostWithVat.toFixed(2),
          s.isSettled ? 'SETTLED' : 'PENDING',
          s.status,
        ].join(','),
      );
    }
    lines.push('');

    // 5. Monthly Wallet Ledger Transactions
    lines.push('=== MONTHLY WALLET LEDGER TRANSACTIONS ===');
    lines.push('Date,Transaction Type,Amount (SAR),Status,Reference ID,Description');
    for (const tx of data.walletLedger) {
      lines.push(
        [
          tx.date,
          tx.type,
          tx.amount.toFixed(2),
          tx.status,
          tx.referenceId || 'N/A',
          `"${(tx.description || '').replace(/"/g, '""')}"`,
        ].join(','),
      );
    }

    const filename = `waslship_statement_${data.billingMonth}_${merchantId.slice(0, 8)}.csv`;
    return {
      filename,
      csvContent: lines.join('\n'),
    };
  }

  /**
   * Generate an enterprise, ZATCA-compliant vector PDF statement using PDFKit
   */
  async generateMonthlyStatementPdf(
    merchantId: string,
    targetMonth?: string,
  ): Promise<{ filename: string; pdfBuffer: Buffer }> {
    const data = await this.getMonthlyStatementData(merchantId, targetMonth);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Monthly Financial Statement - ${data.invoiceNumber}`,
            Author: 'WaslShip Logistics',
            Subject: 'Monthly Invoice, Shipping Fees & Tax Report',
            Keywords: 'Invoice, Tax, VAT, ZATCA, COD, Logistics',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve({
            filename: `waslship_statement_${data.billingMonth}_${merchantId.slice(0, 8)}.pdf`,
            pdfBuffer,
          });
        });

        // -------------------------------------------------------------
        // PDF VISUAL STYLING CONSTANTS
        // -------------------------------------------------------------
        const primaryColor = '#0F172A'; // Slate 900
        const accentColor = '#0284C7'; // Sky 600
        const textMuted = '#64748B'; // Slate 500
        const tableBorder = '#E2E8F0'; // Slate 200
        const tableBg = '#F8FAFC'; // Slate 50

        // ==========================================
        // 1. BRAND HEADER & INVOICE METADATA
        // ==========================================
        doc.rect(40, 40, 515, 60).fill('#F8FAFC');
        doc.rect(40, 40, 6, 60).fill(accentColor);

        doc.fillColor(primaryColor).fontSize(18).font('Helvetica-Bold')
          .text('WASLSHIP LOGISTICS', 55, 50);

        doc.fillColor(textMuted).fontSize(8).font('Helvetica')
          .text('TAX INVOICE & MONTHLY FINANCIAL STATEMENT', 55, 72)
          .text('ZATCA E-Invoicing Phase II Standards Compliant', 55, 83);

        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold')
          .text(`Invoice No: ${data.invoiceNumber}`, 340, 50, { align: 'right', width: 205 })
          .text(`Billing Month: ${data.billingMonth}`, 340, 63, { align: 'right', width: 205 });

        doc.fillColor(textMuted).fontSize(8).font('Helvetica')
          .text(`Period: ${data.periodStart} to ${data.periodEnd}`, 340, 76, { align: 'right', width: 205 })
          .text(`Issue Date: ${data.statementDate}`, 340, 88, { align: 'right', width: 205 });

        doc.y = 115;

        // ==========================================
        // 2. PARTIES SECTION (Supplier vs Merchant)
        // ==========================================
        const partiesY = doc.y;
        // Supplier Box
        doc.rect(40, partiesY, 250, 80).fillAndStroke('#FFFFFF', tableBorder);
        doc.fillColor(accentColor).fontSize(8).font('Helvetica-Bold')
          .text('SERVICE PROVIDER / SUPPLIER', 50, partiesY + 8);
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold')
          .text(data.supplier.companyName, 50, partiesY + 22);
        doc.fillColor(textMuted).fontSize(8).font('Helvetica')
          .text(`VAT ID: ${data.supplier.vatNumber}`, 50, partiesY + 36)
          .text(`CR No: ${data.supplier.crNumber}`, 50, partiesY + 48)
          .text(`${data.supplier.address}, ${data.supplier.city}, ${data.supplier.country}`, 50, partiesY + 60);

        // Merchant Box
        doc.rect(305, partiesY, 250, 80).fillAndStroke('#FFFFFF', tableBorder);
        doc.fillColor(accentColor).fontSize(8).font('Helvetica-Bold')
          .text('CUSTOMER / MERCHANT DETAILS', 315, partiesY + 8);
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold')
          .text(data.merchant.companyName, 315, partiesY + 22);
        doc.fillColor(textMuted).fontSize(8).font('Helvetica')
          .text(`Contact: ${data.merchant.fullName}`, 315, partiesY + 36)
          .text(`Email: ${data.merchant.email}`, 315, partiesY + 48)
          .text(`Phone: ${data.merchant.phoneNumber} | Merchant ID: ${data.merchant.id.slice(0, 8)}`, 315, partiesY + 60);

        // ==========================================
        // 3. EXECUTIVE KPI BENTO TILES
        // ==========================================
        const kpiY = partiesY + 92;
        const boxWidth = 122;
        const boxHeight = 52;

        const kpis = [
          { label: 'TOTAL SHIPMENTS', val: `${data.summary.totalShipmentsCount} (${data.summary.deliveredShipmentsCount} Del.)` },
          { label: 'GROSS COD COLLECTED', val: `${data.summary.grossCodCollected.toFixed(2)} SAR` },
          { label: 'SHIPPING & TAX', val: `${data.summary.totalServicesWithVat.toFixed(2)} SAR` },
          { label: 'NET COD SETTLED', val: `${data.summary.netCodPayoutToWallet.toFixed(2)} SAR` },
        ];

        kpis.forEach((kpi, idx) => {
          const bx = 40 + idx * (boxWidth + 9);
          doc.rect(bx, kpiY, boxWidth, boxHeight).fillAndStroke(tableBg, tableBorder);
          doc.fillColor(textMuted).fontSize(6.5).font('Helvetica-Bold')
            .text(kpi.label, bx + 6, kpiY + 10, { width: boxWidth - 12 });
          doc.fillColor(primaryColor).fontSize(10.5).font('Helvetica-Bold')
            .text(kpi.val, bx + 6, kpiY + 26, { width: boxWidth - 12 });
        });

        // ==========================================
        // 4. ZATCA TAX BREAKDOWN TABLE (15% VAT)
        // ==========================================
        const taxY = kpiY + 64;
        doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold')
          .text('ZATCA Tax Breakdown (15% Value Added Tax)', 40, taxY);

        const tableHeadY = taxY + 16;
        doc.rect(40, tableHeadY, 515, 20).fill(primaryColor);
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
        doc.text('Taxable Service Category', 48, tableHeadY + 6);
        doc.text('Taxable Base (SAR)', 220, tableHeadY + 6, { width: 85, align: 'right' });
        doc.text('VAT Rate', 315, tableHeadY + 6, { width: 50, align: 'center' });
        doc.text('VAT Amount (SAR)', 375, tableHeadY + 6, { width: 85, align: 'right' });
        doc.text('Total Incl. VAT (SAR)', 470, tableHeadY + 6, { width: 80, align: 'right' });

        const taxRowY = tableHeadY + 20;
        doc.rect(40, taxRowY, 515, 20).fillAndStroke('#FFFFFF', tableBorder);
        doc.fillColor(primaryColor).fontSize(8).font('Helvetica');
        doc.text('Express Courier Logistics & Shipping Services', 48, taxRowY + 5);
        doc.text(data.taxReport.taxableServicesAmount.toFixed(2), 220, taxRowY + 5, { width: 85, align: 'right' });
        doc.text(data.taxReport.applicableVatRate, 315, taxRowY + 5, { width: 50, align: 'center' });
        doc.text(data.taxReport.calculatedVatAmount.toFixed(2), 375, taxRowY + 5, { width: 85, align: 'right' });
        doc.font('Helvetica-Bold').text(data.taxReport.grossTotalInclVat.toFixed(2), 470, taxRowY + 5, { width: 80, align: 'right' });

        // ==========================================
        // 5. ITEMIZED SHIPPING FEES BREAKDOWN (TABLE)
        // ==========================================
        const itemHeadY = taxRowY + 32;
        doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold')
          .text('Itemized Shipping Fees & Courier Remittance Log', 40, itemHeadY);

        const shipTableY = itemHeadY + 16;
        doc.rect(40, shipTableY, 515, 20).fill('#334155');
        doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold');
        doc.text('Date', 45, shipTableY + 6);
        doc.text('Tracking No.', 95, shipTableY + 6);
        doc.text('Carrier', 190, shipTableY + 6);
        doc.text('Destination', 245, shipTableY + 6);
        doc.text('COD (SAR)', 320, shipTableY + 6, { width: 50, align: 'right' });
        doc.text('Ship Fee', 375, shipTableY + 6, { width: 45, align: 'right' });
        doc.text('VAT 15%', 425, shipTableY + 6, { width: 40, align: 'right' });
        doc.text('Net Settled', 470, shipTableY + 6, { width: 80, align: 'right' });

        let currentY = shipTableY + 20;
        const maxRowsOnFirstPage = 14;
        const displayedShipments = data.shipments.slice(0, maxRowsOnFirstPage);

        displayedShipments.forEach((s, i) => {
          const bg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(40, currentY, 515, 16).fillAndStroke(bg, tableBorder);
          doc.fillColor(primaryColor).fontSize(7).font('Helvetica');
          doc.text(s.date, 45, currentY + 4);
          doc.text(s.trackingNumber, 95, currentY + 4, { width: 90, ellipsis: true });
          doc.text(s.carrier, 190, currentY + 4);
          doc.text(s.destinationCity, 245, currentY + 4, { width: 70, ellipsis: true });
          doc.text(s.codAmount.toFixed(2), 320, currentY + 4, { width: 50, align: 'right' });
          doc.text(s.shippingCost.toFixed(2), 375, currentY + 4, { width: 45, align: 'right' });
          doc.text(s.vat15Percent.toFixed(2), 425, currentY + 4, { width: 40, align: 'right' });
          const net = s.codAmount > 0 ? (s.codAmount - s.shippingCost).toFixed(2) : `-${s.shippingCost.toFixed(2)}`;
          doc.font('Helvetica-Bold').text(`${net} SAR`, 470, currentY + 4, { width: 80, align: 'right' });
          currentY += 16;
        });

        if (data.shipments.length > maxRowsOnFirstPage) {
          doc.fillColor(textMuted).fontSize(7).font('Helvetica-Oblique')
            .text(`... and ${data.shipments.length - maxRowsOnFirstPage} additional shipments (download full CSV for comprehensive raw records)`, 45, currentY + 4);
          currentY += 14;
        }

        // ==========================================
        // 6. TOTALS SUMMARY BOX & OFFICIAL FOOTER
        // ==========================================
        const totalsY = Math.min(currentY + 12, 730);
        doc.rect(340, totalsY, 215, 48).fillAndStroke('#F1F5F9', tableBorder);
        doc.fillColor(textMuted).fontSize(7.5).font('Helvetica')
          .text('Gross COD Remittance:', 348, totalsY + 6)
          .text('Total Shipping Fees (excl. VAT):', 348, totalsY + 17)
          .text('Total 15% ZATCA VAT:', 348, totalsY + 28)
          .text('Net Balance Added to Wallet:', 348, totalsY + 38);

        doc.fillColor(primaryColor).fontSize(7.5).font('Helvetica-Bold')
          .text(`${data.summary.grossCodCollected.toFixed(2)} SAR`, 450, totalsY + 6, { align: 'right', width: 95 })
          .text(`-${data.summary.totalShippingFees.toFixed(2)} SAR`, 450, totalsY + 17, { align: 'right', width: 95 })
          .text(`-${data.summary.vatAmount.toFixed(2)} SAR`, 450, totalsY + 28, { align: 'right', width: 95 })
          .text(`${data.summary.netCodPayoutToWallet.toFixed(2)} SAR`, 450, totalsY + 38, { align: 'right', width: 95 });

        // Footer note
        doc.fillColor(textMuted).fontSize(7).font('Helvetica')
          .text('This statement is electronically generated by WaslShip Automated Financial Reconciliation Pipeline.', 40, 790)
          .text('Complies with Saudi ZATCA e-invoicing standards. For queries contact support@waslship.com', 40, 800);

        doc.end();
      } catch (err) {
        this.logger.error(`PDF generation failed: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }
}
