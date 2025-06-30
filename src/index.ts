import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Import routes
import healthRoutes from './routes/health';
import chatRoutes from './routes/chat';
import groundxRoutes from './routes/groundx';
import kernelMemoryRoutes from './routes/kernelMemory';
import databaseManagerRoutes from './routes/databaseManager';
import authRoutes from './routes/auth';
import chatSessionsRoutes from './routes/chat-sessions';
import organizationRoutes from './routes/organizations';

// Load environment variables (optional in production)
const result = dotenv.config();
if (result.error && process.env.NODE_ENV !== 'production') {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

// Verify critical environment variables
console.log('Environment Check:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- PORT:', process.env.PORT);
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
console.log('- SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing');

const app = express();
const PORT = process.env.PORT || 3001;

// Disable ETag generation to prevent 304 responses
app.set('etag', false);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:3000", "http://localhost:3001", "https://qig-ruby.vercel.app", "https://*.supabase.co"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

app.use(cors({
  origin: [
    'https://qig-ruby.vercel.app',
    'http://localhost:3000', 
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', healthRoutes);
app.use('/api', chatRoutes);
app.use('/api/groundx', groundxRoutes);
app.use('/api/kernel-memory', kernelMemoryRoutes);
app.use('/api/database-manager', databaseManagerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat-sessions', chatSessionsRoutes);
app.use('/api/organizations', organizationRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Chat API available at http://localhost:${PORT}/api/chat`);
  console.log(`🔐 Auth API available at http://localhost:${PORT}/api/auth`);
  console.log(`🧠 GroundX API available at http://localhost:${PORT}/api/groundx`);
  console.log(`🧬 Kernel Memory API available at http://localhost:${PORT}/api/kernel-memory`);
  console.log(`🗃️ Database Manager API available at http://localhost:${PORT}/api/database-manager`);
  console.log(`🏢 Organization API available at http://localhost:${PORT}/api/organizations`);
});

export default app;