import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'oracle-sport-secret-key';

interface TokenPayload {
  id: number;
  username: string;
  role: string;
}

// Extender la interfaz Request para incluir el usuario
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ 
      success: false, 
      message: 'Acceso denegado. Token no proporcionado.' 
    });
    return; // Terminar la ejecución sin retornar un valor
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = decoded;
    next(); // Continuar al siguiente middleware
  } catch (error) {
    res.status(403).json({ 
      success: false, 
      message: 'Token inválido o expirado.' 
    });
    return; // Terminar la ejecución sin retornar un valor
  }
};

export const authorizeAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ 
      success: false, 
      message: 'Acceso denegado. Usuario no autenticado.' 
    });
    return; // Terminar la ejecución sin retornar un valor
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ 
      success: false, 
      message: 'Acceso denegado. Se requieren privilegios de administrador.' 
    });
    return; // Terminar la ejecución sin retornar un valor
  }

  next(); // Continuar al siguiente middleware
};

// Middleware opcional para autenticación (no requiere token)
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next(); // Continuar sin usuario autenticado
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = decoded;
    next(); // Continuar con usuario autenticado
  } catch (error) {
    // Si el token es inválido, continuar sin usuario autenticado
    next();
  }
};