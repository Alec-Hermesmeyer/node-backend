#!/usr/bin/env node

/**
 * QIG Backend CLI Tool
 * 
 * A comprehensive command-line interface for testing:
 * - Supabase authentication
 * - GroundX organization filtering
 * - All API endpoints with proper token management
 */

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.CLI_BASE_URL || 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api`;
const TOKEN_FILE = path.join(__dirname, '.auth-token');

// Colors for better CLI output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// Token management
function saveToken(token, user) {
  const tokenData = {
    token,
    user,
    timestamp: Date.now()
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  log(colors.green, '💾 Token saved locally');
}

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      // Check if token is less than 1 hour old
      if (Date.now() - tokenData.timestamp < 3600000) {
        return tokenData;
      } else {
        log(colors.yellow, '⚠️  Saved token is expired');
      }
    }
  } catch (error) {
    log(colors.yellow, '⚠️  Could not load saved token');
  }
  return null;
}

function clearToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    fs.unlinkSync(TOKEN_FILE);
    log(colors.green, '🗑️  Token cleared');
  }
}

// API functions
async function login(email, password) {
  try {
    log(colors.blue, `🔐 Logging in as: ${email}`);
    
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    });

    if (response.data.success) {
      log(colors.green, '✅ Login successful!');
      log(colors.cyan, `👤 User: ${response.data.user.email}`);
      log(colors.cyan, `🏢 Organization: ${response.data.user.organization?.name || 'No organization'}`);
      log(colors.cyan, `👑 QIG Admin: ${response.data.user.isQIG ? 'Yes' : 'No'}`);
      
      saveToken(response.data.token, response.data.user);
      return {
        token: response.data.token,
        user: response.data.user
      };
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ Login failed: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

async function verifyToken(token) {
  try {
    const response = await axios.get(`${API_BASE}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data.success;
  } catch (error) {
    return false;
  }
}

async function getBuckets(token) {
  try {
    log(colors.blue, '🧠 Fetching GroundX buckets...');
    
    const response = await axios.get(`${API_BASE}/groundx/buckets`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      log(colors.green, '✅ Buckets fetched successfully!');
      log(colors.cyan, `🏢 Organization: ${response.data.organization}`);
      log(colors.cyan, `📚 Buckets found: ${response.data.buckets.length}`);
      
      response.data.buckets.forEach((bucket, index) => {
        console.log(`  ${index + 1}. ${bucket.name} (ID: ${bucket.id}, ${bucket.documentCount} docs)`);
      });
      
      return response.data.buckets;
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ Failed to fetch buckets: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

async function searchDocuments(token, bucketId, query, limit = 5) {
  try {
    log(colors.blue, `🔍 Searching in bucket ${bucketId} for: "${query}"`);
    
    const response = await axios.post(`${API_BASE}/groundx/search`, {
      query,
      bucketId,
      limit
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      log(colors.green, '✅ Search completed!');
      log(colors.cyan, `📄 Results found: ${response.data.count}`);
      
      response.data.results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.fileName} (score: ${result.score?.toFixed(3) || 'N/A'})`);
        if (result.text) {
          console.log(`     "${result.text.substring(0, 100)}..."`);
        }
      });
      
      return response.data.results;
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ Search failed: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

async function ragQuery(token, bucketId, query, limit = 10, includeThoughts = false) {
  try {
    log(colors.blue, `🤖 Running RAG query in bucket ${bucketId}...`);
    log(colors.cyan, `❓ Query: "${query}"`);
    
    const response = await axios.post(`${API_BASE}/groundx/rag`, {
      query,
      bucketId,
      limit,
      includeThoughts
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      log(colors.green, '✅ RAG query completed!');
      log(colors.cyan, `⏱️  Total time: ${response.data.executionTime?.totalMs}ms`);
      log(colors.cyan, `🔍 Search time: ${response.data.executionTime?.searchMs}ms`);
      log(colors.cyan, `🧠 LLM time: ${response.data.executionTime?.llmMs}ms`);
      log(colors.cyan, `📚 Sources used: ${response.data.searchResults?.count || 0}`);
      
      console.log('\n' + colors.bold + '🤖 AI Response:' + colors.reset);
      console.log(response.data.response);
      
      if (response.data.thoughts) {
        console.log('\n' + colors.bold + '💭 Thoughts:' + colors.reset);
        console.log(response.data.thoughts);
      }
      
      if (response.data.searchResults?.sources) {
        console.log('\n' + colors.bold + '📄 Sources:' + colors.reset);
        response.data.searchResults.sources.forEach((source, index) => {
          console.log(`  ${index + 1}. ${source.fileName} (score: ${source.score?.toFixed(3) || 'N/A'})`);
        });
      }
      
      return response.data;
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ RAG query failed: ${error.response?.data?.error || error.message}`);
    if (error.response?.data) {
      console.log('Full error response:', error.response.data);
    }
    return null;
  }
}

async function xrayDocument(token, documentId) {
  try {
    log(colors.blue, `🔍 Getting X-ray data for document: ${documentId}...`);
    
    const response = await axios.get(`${API_BASE}/groundx/documents/${documentId}/xray`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      }
    });

    if (response.data.success) {
      log(colors.green, '✅ X-ray data retrieved!');
      console.log('\n' + colors.bold + '📄 X-ray Data Structure:' + colors.reset);
      console.log(JSON.stringify(response.data, null, 2));
      return response.data;
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ X-ray request failed: ${error.response?.data?.error || error.message}`);
    if (error.response?.data) {
      console.log('Full error response:', error.response.data);
    }
    return null;
  }
}

async function listChatSessions(token) {
  try {
    log(colors.blue, '📋 Listing chat sessions...');
    
    const response = await axios.get(`${API_BASE}/chat-sessions/sessions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      log(colors.green, '✅ Chat sessions retrieved!');
      console.log('\n' + colors.bold + '💬 Chat Sessions:' + colors.reset);
      
      if (response.data.sessions.length === 0) {
        console.log('  No chat sessions found.');
      } else {
        response.data.sessions.forEach((session, index) => {
          console.log(`  ${index + 1}. ${session.title} (${session.id})`);
          console.log(`     Created: ${new Date(session.created_at).toLocaleString()}`);
          console.log(`     Updated: ${new Date(session.updated_at).toLocaleString()}`);
        });
      }
      
      return response.data.sessions;
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ Failed to list chat sessions: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

async function createChatSession(token, title) {
  try {
    log(colors.blue, `💬 Creating chat session: "${title}"...`);
    
    const response = await axios.post(`${API_BASE}/chat-sessions/sessions`, {
      title
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      log(colors.green, '✅ Chat session created!');
      console.log('\n' + colors.bold + '📝 Session Details:' + colors.reset);
      console.log(`  ID: ${response.data.session.id}`);
      console.log(`  Title: ${response.data.session.title}`);
      console.log(`  Created: ${new Date(response.data.session.created_at).toLocaleString()}`);
      
      return response.data.session;
    } else {
      throw new Error(response.data.error);
    }
  } catch (error) {
    log(colors.red, `❌ Failed to create chat session: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

// Interactive prompts
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function prompt(question) {
  const rl = createInterface();
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Command handlers
async function handleLogin() {
  console.log('\n' + colors.bold + '🔐 Supabase Login' + colors.reset);
  
  const email = await prompt('Email: ');
  const password = await prompt('Password: ');
  
  if (!email || !password) {
    log(colors.red, '❌ Email and password are required');
    return;
  }
  
  await login(email, password);
}

async function handleBuckets() {
  const tokenData = loadToken();
  if (!tokenData) {
    log(colors.red, '❌ No valid token found. Please login first.');
    return;
  }
  
  await getBuckets(tokenData.token);
}

async function handleSearch() {
  const tokenData = loadToken();
  if (!tokenData) {
    log(colors.red, '❌ No valid token found. Please login first.');
    return;
  }
  
  console.log('\n' + colors.bold + '🔍 Document Search' + colors.reset);
  
  const bucketId = await prompt('Bucket ID: ');
  const query = await prompt('Search query: ');
  const limit = await prompt('Limit (default 5): ') || '5';
  
  if (!bucketId || !query) {
    log(colors.red, '❌ Bucket ID and query are required');
    return;
  }
  
  await searchDocuments(tokenData.token, bucketId, query, parseInt(limit));
}

async function handleRag() {
  const tokenData = loadToken();
  if (!tokenData) {
    log(colors.red, '❌ No valid token found. Please login first.');
    return;
  }
  
  console.log('\n' + colors.bold + '🤖 RAG Query' + colors.reset);
  
  const bucketId = await prompt('Bucket ID: ');
  const query = await prompt('Question: ');
  const limit = await prompt('Limit (default 10): ') || '10';
  const includeThoughts = (await prompt('Include thoughts? (y/n): ')).toLowerCase() === 'y';
  
  if (!bucketId || !query) {
    log(colors.red, '❌ Bucket ID and query are required');
    return;
  }
  
  await ragQuery(tokenData.token, bucketId, query, parseInt(limit), includeThoughts);
}

async function handleStatus() {
  const tokenData = loadToken();
  
  if (tokenData) {
    log(colors.green, '✅ Token found');
    log(colors.cyan, `👤 User: ${tokenData.user.email}`);
    log(colors.cyan, `🏢 Organization: ${tokenData.user.organization?.name || 'No organization'}`);
    log(colors.cyan, `👑 QIG Admin: ${tokenData.user.isQIG ? 'Yes' : 'No'}`);
    
    const isValid = await verifyToken(tokenData.token);
    if (isValid) {
      log(colors.green, '✅ Token is valid');
    } else {
      log(colors.red, '❌ Token is invalid or expired');
    }
  } else {
    log(colors.red, '❌ No token found. Please login first.');
  }
}

async function handleXray() {
  const tokenData = loadToken();
  if (!tokenData) {
    log(colors.red, '❌ No valid token found. Please login first.');
    return;
  }
  
  console.log('\n' + colors.bold + '🔍 X-ray Document Data' + colors.reset);
  
  const documentId = await prompt('Document ID: ');
  
  if (!documentId) {
    log(colors.red, '❌ Document ID is required');
    return;
  }
  
  await xrayDocument(tokenData.token, documentId);
}

async function handleChatSessions() {
  const tokenData = loadToken();
  if (!tokenData) {
    log(colors.red, '❌ No valid token found. Please login first.');
    return;
  }
  
  console.log('\n' + colors.bold + '💬 Chat Session Management' + colors.reset);
  
  const action = await prompt('Action (list/create): ');
  
  if (action === 'list') {
    await listChatSessions(tokenData.token);
  } else if (action === 'create') {
    const title = await prompt('Session title: ');
    if (title) {
      await createChatSession(tokenData.token, title);
    } else {
      log(colors.red, '❌ Title is required');
    }
  } else {
    log(colors.red, '❌ Invalid action. Use "list" or "create"');
  }
}

function showHelp() {
  console.log(`
🏗️  QIG Backend CLI Tool

Commands:
  ${colors.green}login${colors.reset}     - Login with Supabase credentials
  ${colors.green}buckets${colors.reset}   - List GroundX buckets (with organization filtering)
  ${colors.green}search${colors.reset}    - Search documents in a bucket
  ${colors.green}rag${colors.reset}       - Run RAG query (AI-powered Q&A)
  ${colors.green}xray${colors.reset}      - Get X-ray data for a document
  ${colors.green}chat-sessions${colors.reset} - Manage chat sessions
  ${colors.green}status${colors.reset}    - Check authentication status
  ${colors.green}logout${colors.reset}    - Clear saved token
  ${colors.green}help${colors.reset}      - Show this help

Quick Start:
  1. node cli.js login     - Login to get JWT token
  2. node cli.js buckets   - See your organization's buckets
  3. node cli.js rag       - Ask questions about your documents

Environment:
  CLI_BASE_URL - API base URL (default: ${API_BASE})

Examples:
  node cli.js login
  node cli.js buckets
  node cli.js rag
  node cli.js xray
  node cli.js status
`);
}

// Main command handler
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'login':
      await handleLogin();
      break;
    case 'buckets':
      await handleBuckets();
      break;
    case 'search':
      await handleSearch();
      break;
    case 'rag':
      await handleRag();
      break;
    case 'status':
      await handleStatus();
      break;
    case 'logout':
      clearToken();
      break;
    case 'xray':
      await handleXray();
      break;
    case 'chat-sessions':
      await handleChatSessions();
      break;
    case 'help':
    case undefined:
      showHelp();
      break;
    default:
      log(colors.red, `❌ Unknown command: ${command}`);
      showHelp();
      break;
  }
}

// Run CLI
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  login,
  getBuckets,
  searchDocuments,
  ragQuery,
  verifyToken
}; 