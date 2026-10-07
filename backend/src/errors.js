const STATUS_MAP = {
  VALIDATION_ERROR:  400,
  NOT_FOUND:         404,
  INVALID_TRANSITION: 409,
  ORDER_IMMUTABLE:   409,
  FARM_ON_HOLD:      409,
  PRODUCT_INACTIVE:  422,
  LABEL_MISMATCH:    422,
  INTERNAL_ERROR:    500,
};

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = STATUS_MAP[code] || 500;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' }
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(err.toJSON());
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  });
}

function notFoundHandler(_req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Unknown route' }
  });
}

module.exports = { AppError, errorHandler, notFoundHandler, STATUS_MAP };