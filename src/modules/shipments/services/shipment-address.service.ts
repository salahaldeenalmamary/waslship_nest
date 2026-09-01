import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAddress } from '../../users/entities/user-address.entity';
import { User } from '../../users/entities/user.entity';
import { CreateUserAddressDto } from '../../users/dtos/user.dto';
import { PaymentMethod } from '../enums/shipment.enum';

export interface OtoAddressDetails {
  senderName: string;
  senderPhone: string;
  senderCity: string;
  senderAddress: string;
  senderDistrict?: string;
  senderPostalCode?: string;
  senderCountry?: string;
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientAddress: string;
  recipientDistrict?: string;
  recipientPostalCode?: string;
  recipientCountry?: string;
}

export interface ValidatedAddressesResult {
  pickupAddress: UserAddress;
  deliveryAddress: UserAddress;
  otoAddressDetails: OtoAddressDetails;
}

export interface PreparedOtoShipmentPayload extends OtoAddressDetails {
  orderId?: string | number;
  deliveryOptionId?: string | number;
  packageWeight?: number;
  packageCount?: number;
  amount?: number;
  amount_due?: number;
  payment_method?: string;
  currency?: string;
}

@Injectable()
export class ShipmentAddressService {
  constructor(
    @InjectRepository(UserAddress)
    private readonly addressRepository: Repository<UserAddress>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Fetch and validate UserAddress details based on pickupAddressId and deliveryAddressId
   * and format the address payload for OTO shipment and order operations.
   */
  async fetchAndValidateAddresses(
    pickupAddressId: string,
    deliveryAddressId: string,
  ): Promise<ValidatedAddressesResult> {
    if (!pickupAddressId) {
      throw new BadRequestException('pickupAddressId is required');
    }
    if (!deliveryAddressId) {
      throw new BadRequestException('deliveryAddressId is required');
    }

    const pickupAddress = await this.addressRepository.findOne({
      where: { id: pickupAddressId, isDeleted: false },
    });
    if (!pickupAddress) {
      throw new NotFoundException(
        `Pickup address with ID '${pickupAddressId}' was not found in UserAddress records`,
      );
    }

    const deliveryAddress = await this.addressRepository.findOne({
      where: { id: deliveryAddressId, isDeleted: false },
    });
    if (!deliveryAddress) {
      throw new NotFoundException(
        `Delivery address with ID '${deliveryAddressId}' was not found in UserAddress records`,
      );
    }

    if (!pickupAddress.city) {
      throw new BadRequestException(
        `Pickup address '${pickupAddressId}' does not have a city specified`,
      );
    }
    if (!deliveryAddress.city) {
      throw new BadRequestException(
        `Delivery address '${deliveryAddressId}' does not have a city specified`,
      );
    }

    const formatAddress = (addr: UserAddress) => {
      const parts = [
        addr.street,
        addr.district,
        addr.buildingNumber,
        addr.city,
      ].filter(Boolean);
      return parts.length > 0
        ? parts.join(', ')
        : addr.city || 'Standard Address';
    };

    const otoAddressDetails: OtoAddressDetails = {
      senderName: pickupAddress.contactName || 'Wasl Merchant',
      senderPhone: pickupAddress.contactPhone || '+966500000000',
      senderCity: pickupAddress.city,
      senderAddress: formatAddress(pickupAddress),
      senderDistrict: pickupAddress.district,
      senderPostalCode: pickupAddress.postalCode,
      senderCountry: pickupAddress.country || 'Saudi Arabia',

      recipientName: deliveryAddress.contactName || 'Customer',
      recipientPhone: deliveryAddress.contactPhone || '+966500000001',
      recipientCity: deliveryAddress.city,
      recipientAddress: formatAddress(deliveryAddress),
      recipientDistrict: deliveryAddress.district,
      recipientPostalCode: deliveryAddress.postalCode,
      recipientCountry: deliveryAddress.country || 'Saudi Arabia',
    };

    return {
      pickupAddress,
      deliveryAddress,
      otoAddressDetails,
    };
  }

  /**
   * Helper function to prepare the full payload for the OTO createShipment / createOrder request
   */
  async prepareOtoCreateShipmentPayload(
    pickupAddressId: string,
    deliveryAddressId: string,
    shipmentDetails?: {
      orderId?: string | number;
      deliveryOptionId?: string | number;
      weightKg?: number;
      piecesCount?: number;
      paymentMethod?: PaymentMethod | string;
      codAmount?: number;
      currency?: string;
    },
  ): Promise<{
    pickupAddress: UserAddress;
    deliveryAddress: UserAddress;
    payload: PreparedOtoShipmentPayload;
  }> {
    const { pickupAddress, deliveryAddress, otoAddressDetails } =
      await this.fetchAndValidateAddresses(pickupAddressId, deliveryAddressId);

    const isCod =
      shipmentDetails?.paymentMethod === PaymentMethod.COD ||
      shipmentDetails?.paymentMethod === 'COD';
    const codAmount = shipmentDetails?.codAmount || 0;

    const payload: PreparedOtoShipmentPayload = {
      ...otoAddressDetails,
      orderId: shipmentDetails?.orderId,
      deliveryOptionId: shipmentDetails?.deliveryOptionId,
      packageWeight: shipmentDetails?.weightKg || 1,
      packageCount: shipmentDetails?.piecesCount || 1,
      amount: codAmount,
      amount_due: isCod ? codAmount : 0,
      payment_method: isCod ? 'COD' : 'Prepaid',
      currency: shipmentDetails?.currency || 'SAR',
    };

    return {
      pickupAddress,
      deliveryAddress,
      payload,
    };
  }

  /**
   * Admin: Get all saved addresses for a specific merchant
   */
  async getMerchantAddressesAdmin(merchantId: string) {
    const merchant = await this.userRepository.findOne({
      where: { id: merchantId, isDeleted: false },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID '${merchantId}' not found`);
    }

    const addresses = await this.addressRepository.find({
      where: { userId: merchantId, isDeleted: false },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });

    return {
      merchant: {
        id: merchant.id,
        fullName: merchant.fullName,
        email: merchant.email,
        phone: merchant.phoneNumber,
        companyName: merchant.companyName,
      },
      addresses,
    };
  }

  /**
   * Admin: Create a new address for a specific merchant
   */
  async createMerchantAddressAdmin(
    merchantId: string,
    dto: CreateUserAddressDto,
  ) {
    const merchant = await this.userRepository.findOne({
      where: { id: merchantId, isDeleted: false },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant with ID '${merchantId}' not found`);
    }

    if (dto.isDefault) {
      await this.addressRepository.update(
        { userId: merchantId, isDeleted: false },
        { isDefault: false },
      );
    }

    const address = this.addressRepository.create({
      ...dto,
      userId: merchantId,
    });
    return this.addressRepository.save(address);
  }
}
