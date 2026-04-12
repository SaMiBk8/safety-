import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'agora-token';
const { RtcTokenBuilder, RtcRole } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Agora Token Endpoint
  app.get('/api/agora/token', (req, res) => {
    const channelName = req.query.channelName as string;
    console.log(`Token request for channel: ${channelName}`);
    
    if (!channelName) {
      return res.status(400).json({ error: 'channelName is required' });
    }

    const appId = process.env.VITE_AGORA_APP_ID?.trim();
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();

    if (!appId || !appCertificate) {
      console.error('Agora credentials missing: AppID:', !!appId, 'Cert:', !!appCertificate);
      return res.status(500).json({ 
        error: 'Agora credentials not configured on server. Please set VITE_AGORA_APP_ID and AGORA_APP_CERTIFICATE in the Secrets panel.' 
      });
    }

    console.log(`Agora Credentials Check: AppID length=${appId.length}, Cert length=${appCertificate.length}`);

    const uid = 0;
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    
    try {
      let token;
      console.log(`Generating token with: AppID=${appId?.substring(0, 5)}..., Cert=${appCertificate?.substring(0, 5)}..., Channel=${channelName}, ExpireTS=${privilegeExpiredTs}`);
      
      try {
        // Some versions of agora-token 2.x expect absolute timestamps (seconds since epoch)
        token = RtcTokenBuilder.buildTokenWithUid(
          appId,
          appCertificate,
          channelName,
          uid,
          role,
          privilegeExpiredTs,
          privilegeExpiredTs
        );
      } catch (e) {
        console.warn('7-argument token generation failed, trying 6-argument version');
        token = (RtcTokenBuilder as any).buildTokenWithUid(
          appId,
          appCertificate,
          channelName,
          uid,
          role,
          privilegeExpiredTs
        );
      }
      console.log('Token generated successfully');
      res.json({ token });
    } catch (error) {
      console.error('Error generating Agora token:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const startApp = (port: number) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`\n\n>>> SAFECHILD FULL-STACK SERVER STARTED ON PORT ${port} <<<\n\n`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, retrying in 2 seconds...`);
        setTimeout(() => {
          server.close();
          startApp(port);
        }, 2000);
      } else {
        console.error('Server error:', err);
      }
    });
  };

  startApp(PORT);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
