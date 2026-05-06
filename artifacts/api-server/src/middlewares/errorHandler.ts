import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod/v4";
import { HttpError } from "../lib/errors";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    req.log?.warn({ err: err.issues }, "Validation error");
    res.status(400).json({
      error: { code: "validation_error", message: "Invalid request body", details: err.issues },
    });
    return;
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      req.log?.error({ err }, err.message);
    } else {
      req.log?.warn({ code: err.code, status: err.status }, err.message);
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({
    error: { code: "internal_error", message: "Internal server error" },
  });
};
