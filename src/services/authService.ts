import jwt, { Secret, SignOptions} from 'jsonwebtoken';
import { User, UserModel } from '../models/user';
import { AppError } from '../middlewares/errorHandler';
import dotenv from 'dotenv';

dotenv.config();
const JWT_SECRET: Secret = process.env.JWT_SECRET || 'default_secret_key';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN) as SignOptions["expiresIn"];

const userModel = new UserModel();

export class AuthService {
  async register(userData: User): Promise<{ user: Partial<User>, token: string }> {
    // Verificar si el nombre de usuario ya existe
    const existingUsername = await userModel.findByUsername(userData.username);
    if (existingUsername) {
      throw new AppError('El nombre de usuario ya está en uso.', 400);
    }

    // Verificar si el correo electrónico ya existe
    const existingEmail = await userModel.findByEmail(userData.email);
    if (existingEmail) {
      throw new AppError('El correo electrónico ya está registrado.', 400);
    }

    // Crear el nuevo usuario
    const newUser = await userModel.create(userData);

    // Generar token JWT
    const token = this.generateToken(newUser);

    // Devolver usuario sin contraseña y token
    const { password, ...userWithoutPassword } = newUser;
    return { user: userWithoutPassword, token };
  }

  async login(username: string, password: string): Promise<{ user: Partial<User>, token: string }> {
    // Buscar usuario por nombre de usuario
    const user = await userModel.findByUsername(username);
    if (!user) {
      throw new AppError('Credenciales incorrectas.', 401);
    }

    // Verificar contraseña
    const isPasswordValid = await userModel.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Credenciales incorrectas.', 401);
    }

    // Generar token JWT
    const token = this.generateToken(user);

    // Devolver usuario sin contraseña y token
    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  private generateToken(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { 
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'oracle-sport',
        audience: 'oracle-sport-refresh'
      }
    );
  }
}

export default new AuthService();