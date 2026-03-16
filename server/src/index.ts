// Load env vars BEFORE any other imports (static imports are hoisted)
import './env';
import app from './app';
import { registerCronJobs } from './cron';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  registerCronJobs();
});

export default app;
