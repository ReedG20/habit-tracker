import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

// Hourly, because users' days end at every hour of UTC. Each run checks every
// user whose local day has ended since their last check (`lockouts.checkUser`).
crons.cron('check habits for misses', '5 * * * *', internal.lockouts.checkAll, {});

export default crons;
