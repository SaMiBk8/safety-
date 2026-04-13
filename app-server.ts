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

    if (!appId) {
      console.error('Agora App ID missing');
      return res.status(500).json({ 
        error: 'Agora App ID not configured. Please set VITE_AGORA_APP_ID in the Secrets panel.' 
      });
    }

    if (!appCertificate) {
      console.log('Agora App Certificate missing, returning null token');
      return res.json({ token: null });
    }

    console.log(`Agora Credentials Check: AppID length=${appId.length}, Cert length=${appCertificate.length}`);

    const uid = 0;
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600 * 24; // 24 hours for maximum stability
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    
    try {
      let token;
      console.log(`Generating Agora Token:
        Channel: ${channelName}
        AppID: ${appId.substring(0, 5)}...
        Cert: ${appCertificate.substring(0, 5)}...
        UID: ${uid}
        Role: ${role}
        Current Time: ${currentTimestamp}
        Expire Time: ${privilegeExpiredTs}
      `);
      
      try {
        // Try 7-argument version (newer SDKs)
        token = RtcTokenBuilder.buildTokenWithUid(
          appId,
          appCertificate,
          channelName,
          uid,
          role,
          privilegeExpiredTs,
          privilegeExpiredTs
        );
        console.log('Token generated using 7-argument method');
      } catch (e) {
        console.warn('7-argument method failed, falling back to 6-argument method');
        token = (RtcTokenBuilder as any).buildTokenWithUid(
          appId,
          appCertificate,
          channelName,
          uid,
          role,
          privilegeExpiredTs
        );
        console.log('Token generated using 6-argument method');
      }

      if (!token) {
        throw new Error('Token builder returned empty result');
      }

      console.log(`Token generated successfully. Length: ${token.length}`);
      res.json({ token });
    } catch (error) {
      console.error('CRITICAL: Agora Token Generation Failed:', error);
      res.status(500).json({ 
        error: 'Failed to generate security token',
        details: error instanceof Error ? error.message : String(error)
      });
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
