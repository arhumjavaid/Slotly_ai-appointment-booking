import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth';
import { validatedQuery } from '../middleware/validate';
import { sendSuccess } from '../utils/http';
import { appointmentService } from '../services/appointments/appointment.service';
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from '../schemas/appointment.schema';

export const appointmentController = {
  async create(req: Request, res: Response) {
    const appointment = await appointmentService.create(
      currentUser(req).id,
      req.body as CreateAppointmentInput,
      { source: 'MANUAL' },
    );
    return sendSuccess(res, { appointment }, 201);
  },

  async list(req: Request, res: Response) {
    const result = await appointmentService.list(
      currentUser(req).id,
      validatedQuery<ListAppointmentsQuery>(req),
    );
    return sendSuccess(res, result);
  },

  async getById(req: Request, res: Response) {
    const appointment = await appointmentService.getById(currentUser(req).id, req.params.id!);
    return sendSuccess(res, { appointment });
  },

  async update(req: Request, res: Response) {
    const appointment = await appointmentService.update(
      currentUser(req).id,
      req.params.id!,
      req.body as UpdateAppointmentInput,
    );
    return sendSuccess(res, { appointment });
  },

  async remove(req: Request, res: Response) {
    await appointmentService.remove(currentUser(req).id, req.params.id!);
    return res.status(204).send();
  },
};
