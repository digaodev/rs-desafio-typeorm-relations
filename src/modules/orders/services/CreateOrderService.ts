import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerFound = await this.customersRepository.findById(customer_id);
    if (!customerFound) throw new AppError('Customer does not exist');

    const productsFound = await this.productsRepository.findAllById(products);
    if (productsFound.length === 0) throw new AppError('All products missing');

    const isAllProductsFound = products.length === productsFound.length;
    if (!isAllProductsFound) throw new AppError('One or more products missing');

    const unavailableProducts = productsFound.filter(pf => {
      const incomingProduct = products.find(ip => ip.id === pf.id);

      return pf.quantity - (incomingProduct?.quantity || 0) < 0;
    });

    // console.log('unavailableProducts', unavailableProducts);

    if (unavailableProducts.length > 0)
      throw new AppError('One or more products are unavailable');

    const serializedProducts = products.map(p => ({
      product_id: p.id,
      quantity: p.quantity,
      price: productsFound.filter(pf => pf.id === p.id)[0].price,
    }));

    const newOrder = await this.ordersRepository.create({
      customer: customerFound,
      products: serializedProducts,
    });

    const orderedProductsQuantity = newOrder.order_products.map(p => ({
      id: p.product_id,
      quantity:
        productsFound.filter(pf => pf.id === p.product_id)[0].quantity -
        p.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return newOrder;
  }
}

export default CreateOrderService;
