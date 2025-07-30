import express from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import sportRoutes from './sportRoutes';
import competitionRoutes from './competitionRoutes';
import eventRoutes from './eventRoutes';
import ticketRoutes from './ticketRoutes';
import betRoutes from './betRoutes';
import depositRoutes from './depositRoutes';
import withdrawalRoutes from './withdrawalRoutes';

const router = express.Router();

// Rutas públicas
router.use('/auth', authRoutes);
router.use('/sports', sportRoutes);
router.use('/events', eventRoutes);
router.use('/competitions', competitionRoutes);

// Rutas protegidas
router.use('/users', userRoutes);
router.use('/tickets', ticketRoutes);
router.use('/bets', betRoutes);
router.use('/deposits', depositRoutes);
router.use('/withdrawals', withdrawalRoutes);

export default router;
