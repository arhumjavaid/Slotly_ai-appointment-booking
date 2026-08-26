import type { Request, Response } from 'express';
import { sendSuccess } from '../utils/http';
import { availabilityService } from '../services/availability/availability.service';

export const availabilityController = {
  async list(_req: Request, res: Response) {
    const services = await availabilityService.listServices();
    return sendSuccess(res, { services });
  },
};
