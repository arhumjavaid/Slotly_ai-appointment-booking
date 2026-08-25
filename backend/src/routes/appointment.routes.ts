import { Router } from 'express';
import { appointmentController } from '../controllers/appointment.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
} from '../schemas/appointment.schema';

export const appointmentRoutes = Router();

// Every appointment route is authenticated; ownership is then enforced again in
// the repository's query predicates.
appointmentRoutes.use(requireAuth);

appointmentRoutes.post(
  '/',
  writeLimiter,
  validate(createAppointmentSchema),
  asyncHandler(appointmentController.create),
);

appointmentRoutes.get(
  '/',
  validate(listAppointmentsQuerySchema, 'query'),
  asyncHandler(appointmentController.list),
);

appointmentRoutes.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(appointmentController.getById),
);

appointmentRoutes.patch(
  '/:id',
  writeLimiter,
  validate(idParamSchema, 'params'),
  validate(updateAppointmentSchema),
  asyncHandler(appointmentController.update),
);

appointmentRoutes.delete(
  '/:id',
  writeLimiter,
  validate(idParamSchema, 'params'),
  asyncHandler(appointmentController.remove),
);
