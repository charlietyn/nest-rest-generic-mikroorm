import { Controller } from '@nestjs/common';
import { RestController } from '../src/index.js';
import { Product } from './product.entity.js';
import { ProductService } from './product.service.js';

@Controller('products')
export class ProductController extends RestController<Product> {
  constructor(service: ProductService) {
    super(service);
  }
}
