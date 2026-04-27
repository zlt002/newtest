import express from 'express';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import fs from 'fs';
import fetch from 'node-fetch';

import { searchConversations } from '../projects.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Health check endpoint (no authentication required)
router.get('/health', (req, res) => {
  const installMode = fs.existsSync(path.join(new URL('.', import.meta.url).pathname, '..', '..', '.git')) ? 'git' : 'npm';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    installMode
  });
});

// System update endpoint
router.post('/system/update', authenticateToken, async (req, res) => {
  try {
    // Get the project root directory (parent of server directory)
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const projectRoot = path.join(__dirname, '..', '..');

    // Determine install mode
    const installMode = fs.existsSync(path.join(projectRoot, '.git')) ? 'git' : 'npm';

    console.log('Starting system update from directory:', projectRoot);

    // Run the update command based on install mode
    const updateCommand = installMode === 'git'
      ? 'git checkout main && git pull && npm install'
      : 'npm install -g @cloudcli-ai/cloudcli@latest';

    const child = spawn('sh', ['-c', updateCommand], {
      cwd: installMode === 'git' ? projectRoot : os.homedir(),
      env: process.env
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('Update output:', text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error('Update error:', text);
    });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({
          success: true,
          output: output || 'Update completed successfully',
          message: 'Update completed. Please restart the server to apply changes.'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Update command failed',
          output: output,
          errorOutput: errorOutput
        });
      }
    });

    child.on('error', (error) => {
      console.error('Update process error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    });

  } catch (error) {
    console.error('System update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Audio transcription endpoint
router.post('/transcribe', authenticateToken, async (req, res) => {
  try {
    const multer = (await import('multer')).default;
    const upload = multer({ storage: multer.memoryStorage() });

    // Handle multipart form data
    upload.single('audio')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to process audio file' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.' });
      }

      try {
        // Create form data for OpenAI
        const FormData = (await import('form-data')).default;
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'json');
        formData.append('language', 'en');

        // Make request to OpenAI
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...formData.getHeaders()
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `Whisper API error: ${response.status}`);
        }

        const data = await response.json();
        let transcribedText = data.text || '';

        // Check if enhancement mode is enabled
        const mode = req.body.mode || 'default';

        // If no transcribed text, return empty
        if (!transcribedText) {
          return res.json({ text: '' });
        }

        // If default mode, return transcribed text without enhancement
        if (mode === 'default') {
          return res.json({ text: transcribedText });
        }

        // Handle different enhancement modes
        try {
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ apiKey });

          let prompt, systemMessage, temperature = 0.7, maxTokens = 800;

          switch (mode) {
            case 'prompt':
              systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
              prompt = `You are an expert prompt engineer. Transform the following rough instruction into a clear, detailed, and context-aware AI prompt.

Your enhanced prompt should:
1. Be specific and unambiguous
2. Include relevant context and constraints
3. Specify the desired output format
4. Use clear, actionable language
5. Include examples where helpful
6. Consider edge cases and potential ambiguities

Transform this rough instruction into a well-crafted prompt:
"${transcribedText}"

Enhanced prompt:`;
              break;

            case 'vibe':
            case 'instructions':
            case 'architect':
              systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
              temperature = 0.5; // Lower temperature for more controlled output
              prompt = `Transform the following idea into clear, well-structured instructions that an AI agent can easily understand and execute.

IMPORTANT RULES:
- Format as clear, step-by-step instructions
- Add reasonable implementation details based on common patterns
- Only include details directly related to what was asked
- Do NOT add features or functionality not mentioned
- Keep the original intent and scope intact
- Use clear, actionable language an agent can follow

Transform this idea into agent-friendly instructions:
"${transcribedText}"

Agent instructions:`;
              break;

            default:
              // No enhancement needed
              break;
          }

          // Only make GPT call if we have a prompt
          if (prompt) {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: prompt }
              ],
              temperature: temperature,
              max_tokens: maxTokens
            });

            transcribedText = completion.choices[0].message.content || transcribedText;
          }

        } catch (gptError) {
          console.error('GPT processing error:', gptError);
          // Fall back to original transcription if GPT fails
        }

        res.json({ text: transcribedText });

      } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    console.error('Endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search conversations content (SSE streaming)
router.get('/search/conversations', authenticateToken, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const parsedLimit = Number.parseInt(String(req.query.limit), 10);
  const limit = Number.isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 100));

  if (query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  const abortController = new AbortController();
  req.on('close', () => { closed = true; abortController.abort(); });

  try {
    await searchConversations(query, limit, ({ projectResult, totalMatches, scannedProjects, totalProjects }) => {
      if (closed) return;
      if (projectResult) {
        res.write(`event: result\ndata: ${JSON.stringify({ projectResult, totalMatches, scannedProjects, totalProjects })}\n\n`);
      } else {
        res.write(`event: progress\ndata: ${JSON.stringify({ totalMatches, scannedProjects, totalProjects })}\n\n`);
      }
    }, abortController.signal);
    if (!closed) {
      res.write(`event: done\ndata: {}\n\n`);
    }
  } catch (error) {
    console.error('Error searching conversations:', error);
    if (!closed) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Search failed' })}\n\n`);
    }
  } finally {
    if (!closed) {
      res.end();
    }
  }
});

export default router;
