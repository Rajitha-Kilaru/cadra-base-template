const { z } = require('zod');
const { AppError } = require('../errors');
const { STATUSES } = require('../domain/lifecycle');
const { normaliseProductCode } = require('../domain/productCode');

const STATUS_ENUM = z.enum(STATUSES);

const CROP_RE = /^[A-Z][A-Z /-]*$/;
const STATE_RE = /^[A-Z]{2}$/;

const listQuery = z.object({
  status: STATUS_ENUM.optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

const createOrder = z.object({
  farm_id: z.string()
    .trim()
    .min(1, 'farm_id is required')
    .transform(s => s.toUpperCase().replace(/[\s_-]+/g, ''))
    .refine(
      s => /^F\d{1,5}$/.test(s) || /^FARM\d{1,5}$/.test(s),
      { message: "farm_id must be a valid farm id like F-020" }
    )
    .transform(s => {
      const m = s.match(/^(?:F|FARM)(\d{1,5})$/);
      return `F-${String(parseInt(m[1], 10)).padStart(3, '0')}`;
    }),
  field: z.object({
    crop: z.string()
      .trim()
      .min(1, 'crop is required')
      .transform(s => s.toUpperCase())
      .refine(s => CROP_RE.test(s), { message: 'crop is not a valid crop name' }),
    state: z.string()
      .trim()
      .min(1, 'state is required')
      .transform(s => s.toUpperCase().replace('.', ''))
      .refine(s => STATE_RE.test(s), { message: 'state must be a US state code like IA' }),
    growth_stage: z.number().int().min(0, 'growth_stage must be an integer >= 0'),
  }),
  idempotency_key: z.string().trim().min(1, 'idempotency_key is required').max(200, 'idempotency_key max 200 characters'),
}).strict();

const addLineBody = z.object({
  product_code: z.string().trim().min(1, 'product_code is required')
    .transform(s => normaliseProductCode(s))
    .refine(s => s !== null, { message: 'product_code must be in canonical form AAA-9999' }),
  qty: z.number().int('qty must be an integer').min(1, 'qty must be a positive integer'),
}).strict();

const transitionBody = z.object({
  to: STATUS_ENUM,
}).strict();

const addNoteBody = z.object({
  author: z.enum(['farm', 'ops'], { message: 'author must be "farm" or "ops"' }),
  text: z.string().trim().min(1, 'text is required').max(2000, 'text max 2000 characters'),
}).strict();

// Parse with zod; throw AppError(VALIDATION_ERROR) naming the field on failure.
function parseOr400(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const firstIssue = result.error.issues[0];
  const field = firstIssue.path.length ? firstIssue.path[0] : 'body';
  const message = firstIssue.message || 'invalid value';
  throw new AppError('VALIDATION_ERROR', `Invalid ${field}: ${message}`);
}

module.exports = {
  listQuery, createOrder, addLineBody, transitionBody, addNoteBody, parseOr400,
};