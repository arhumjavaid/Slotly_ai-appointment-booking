import { Router } from 'express';
import { availabilityController } from '../controllers/availability.controller';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/http';

export const availabilityRoutes = Router();

// Read-only: opening hours are seeded, not managed through the API. Still
// authenticated, because the catalogue is only meaningful to a signed-in user
// and there is no reason to expose it more widely than the app itself.
availabilityRoutes.use(requireAuth);

availabilityRoutes.get('/', asyncHandler(availabilityController.list));
