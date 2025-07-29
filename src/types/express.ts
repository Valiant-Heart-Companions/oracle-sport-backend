import { Request, Response, NextFunction } from 'express';

// Tipos para controladores
export type ControllerFunction = (
  req: Request, 
  res: Response, 
  next: NextFunction
) => Promise<void> | void;

// Tipos para middlewares
export type MiddlewareFunction = (
  req: Request, 
  res: Response, 
  next: NextFunction
) => void;

// Tipo para middleware de manejo de errores
export type ErrorMiddlewareFunction = (
  err: any,
  req: Request, 
  res: Response, 
  next: NextFunction
) => void;