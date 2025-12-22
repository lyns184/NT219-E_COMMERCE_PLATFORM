import Joi from 'joi';

// ============================================
// SECURE PAYMENT VALIDATION SCHEMAS
// ============================================

// Secure ObjectId pattern (MongoDB)
const objectIdPattern = /^[a-fA-F0-9]{24}$/;

// Product item schema with strict validation
const productItemSchema = Joi.object({
  productId: Joi.string()
    .pattern(objectIdPattern)
    .required()
    .messages({
      'string.pattern.base': 'Invalid product ID format'
    }),
  quantity: Joi.number()
    .integer()
    .min(1)
    .max(100) // Reasonable max quantity per item
    .required()
    .messages({
      'number.min': 'Quantity must be at least 1',
      'number.max': 'Maximum quantity per item is 100'
    })
}).options({ stripUnknown: true }); // Strip any extra fields

export const createPaymentIntentSchema = Joi.object({
  items: Joi.array()
    .items(productItemSchema)
    .min(1)
    .max(50) // Maximum 50 different items per order
    .required()
    .messages({
      'array.min': 'At least one item is required',
      'array.max': 'Maximum 50 items per order'
    }),
  
  // SECURITY: Explicitly forbid these fields from client
  amount: Joi.forbidden().messages({
    'any.unknown': 'Amount cannot be specified by client'
  }),
  currency: Joi.forbidden().messages({
    'any.unknown': 'Currency cannot be specified by client'
  }),
  price: Joi.forbidden().messages({
    'any.unknown': 'Price cannot be specified by client'
  }),
  total: Joi.forbidden().messages({
    'any.unknown': 'Total cannot be specified by client'
  }),
  discount: Joi.forbidden().messages({
    'any.unknown': 'Discount cannot be specified by client'
  })
}).options({ stripUnknown: true });

// Validate payment amount server-side
export const validatePaymentAmount = (amount: number): { valid: boolean; error?: string } => {
  // SECURITY: All payment amount validation happens server-side
  
  // Check if amount is a valid number
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Invalid amount format' };
  }
  
  // Check positive amount
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be positive' };
  }
  
  // Minimum payment amount (Stripe minimum is $0.50 USD)
  const MIN_AMOUNT_CENTS = 50; // $0.50
  if (amount < MIN_AMOUNT_CENTS) {
    return { valid: false, error: 'Minimum payment amount is $0.50' };
  }
  
  // Maximum payment amount (prevent overflow/fraud)
  const MAX_AMOUNT_CENTS = 100000000; // $1,000,000
  if (amount > MAX_AMOUNT_CENTS) {
    return { valid: false, error: 'Amount exceeds maximum allowed' };
  }
  
  // Check for valid integer (cents should be whole numbers)
  if (!Number.isInteger(amount)) {
    return { valid: false, error: 'Amount must be in whole cents' };
  }
  
  return { valid: true };
};

// Validate product exists and get actual price
export interface ProductPriceInfo {
  productId: string;
  actualPrice: number;
  available: boolean;
  stock: number;
}

// Validate order totals match (compare client calculation with server)
export const validateOrderTotal = (
  items: Array<{ productId: string; quantity: number }>,
  productPrices: Map<string, ProductPriceInfo>
): { valid: boolean; calculatedTotal: number; error?: string } => {
  let calculatedTotal = 0;
  
  for (const item of items) {
    const priceInfo = productPrices.get(item.productId);
    
    if (!priceInfo) {
      return { valid: false, calculatedTotal: 0, error: `Product ${item.productId} not found` };
    }
    
    if (!priceInfo.available) {
      return { valid: false, calculatedTotal: 0, error: `Product ${item.productId} is not available` };
    }
    
    if (priceInfo.stock < item.quantity) {
      return { valid: false, calculatedTotal: 0, error: `Insufficient stock for product ${item.productId}` };
    }
    
    calculatedTotal += priceInfo.actualPrice * item.quantity;
  }
  
  const amountValidation = validatePaymentAmount(calculatedTotal);
  if (!amountValidation.valid) {
    return { valid: false, calculatedTotal, error: amountValidation.error };
  }
  
  return { valid: true, calculatedTotal };
};
