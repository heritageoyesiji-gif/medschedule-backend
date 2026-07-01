import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { sendError } from "../utils/response";

// Validates and normalizes req.body against a Zod schema. On success, req.body is
// replaced with the parsed value (unknown keys stripped). On failure, responds 400
// with the first issue's path + message. Run after express.json().
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue.path.join(".");
      const message = path ? `${path}: ${issue.message}` : issue.message;
      sendError(res, 400, "VALIDATION_ERROR", message);
      return;
    }
    req.body = result.data as ZodInfer<S>;
    next();
  };
}
