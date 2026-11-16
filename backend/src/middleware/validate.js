import { z } from "zod";

function sendInvalid(res, error) {
  const {formErrors, fieldErrors } = z.flattenError(error);
  return res.status(400).json({ error: "Input tidak valid", formErrors, fieldErrors });
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return sendInvalid(res, result.error);
    req.body = result.data;
    next();
  };
}

export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return sendInvalid(res, result.error);
    req.params = result.data;
    next();
  };
}

// Express 5 makes req.query a read-only getter, so the parsed query is stored in req.validatedQuery.
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return sendInvalid(res, result.error);
    req.validatedQuery = result.data;
    next();
  };
}
