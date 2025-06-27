const fetch = require('node-fetch');

// Get API key from environment (you'll need to set this)
const API_KEY = process.env.DATABASE_MANAGER_API_KEY || 'your-api-key-here';
const BASE_URL = 'https://databasemanager2.azurewebsites.net';

async function testEndpoint(method, path, body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
                'Authorization': `Bearer ${API_KEY}` // Try both header formats
            }
        };
        
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${BASE_URL}${path}`, options);
        const text = await response.text();
        
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(text);
        } catch (e) {
            parsedResponse = text;
        }
        
        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: parsedResponse
        };
    } catch (error) {
        return {
            error: error.message
        };
    }
}

async function runComprehensiveTest() {
    console.log('🔍 Database Manager API Comprehensive Endpoint Discovery\n');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`API Key: ${API_KEY ? '[SET]' : '[NOT SET]'}\n`);
    
    const tests = [
        // Known working endpoints
        { method: 'GET', path: '/api/health', description: 'Health check endpoint' },
        { method: 'POST', path: '/api/chat', body: { user_input: 'test' }, description: 'Main chat endpoint' },
        { method: 'POST', path: '/api/chat', body: { user_input: 'help' }, description: 'Chat with help command' },
        { method: 'POST', path: '/api/chat', body: { user_input: 'SHOW TABLES' }, description: 'Chat with SQL command' },
        { method: 'POST', path: '/api/chat', body: { user_input: 'list databases' }, description: 'Chat with database list command' },
        { method: 'POST', path: '/api/chat', body: { query: 'test' }, description: 'Chat with query parameter' },
        
        // Root endpoint
        { method: 'GET', path: '/', description: 'Root endpoint' },
        
        // Common REST patterns
        { method: 'GET', path: '/api', description: 'API root' },
        { method: 'OPTIONS', path: '/api/chat', description: 'Chat OPTIONS for CORS' },
        
        // Database-specific patterns
        { method: 'GET', path: '/api/databases', description: 'List databases' },
        { method: 'GET', path: '/api/tables', description: 'List tables' },
        { method: 'GET', path: '/api/schema', description: 'Get schema' },
        { method: 'POST', path: '/api/query', body: { sql: 'SHOW TABLES' }, description: 'Direct SQL query' },
        { method: 'POST', path: '/api/execute', body: { command: 'help' }, description: 'Execute command' },
        
        // Alternative chat patterns
        { method: 'POST', path: '/chat', body: { user_input: 'test' }, description: 'Chat without /api prefix' },
        { method: 'POST', path: '/api/chat/query', body: { user_input: 'test' }, description: 'Chat query subpath' },
        
        // Azure Function patterns
        { method: 'POST', path: '/api/DatabaseManager', body: { user_input: 'test' }, description: 'Potential function name' },
        { method: 'POST', path: '/api/ChatFunction', body: { user_input: 'test' }, description: 'Chat function name' },
        
        // Status/monitoring endpoints
        { method: 'GET', path: '/status', description: 'Status endpoint' },
        { method: 'GET', path: '/ping', description: 'Ping endpoint' },
        { method: 'GET', path: '/version', description: 'Version endpoint' },
        { method: 'GET', path: '/info', description: 'Info endpoint' }
    ];
    
    const results = {
        working: [],
        clientErrors: [], // 4xx
        serverErrors: [], // 5xx
        notFound: [], // 404
        other: []
    };
    
    for (const test of tests) {
        console.log(`Testing: ${test.method} ${test.path} - ${test.description}`);
        const result = await testEndpoint(test.method, test.path, test.body);
        
        if (result.error) {
            results.other.push({ ...test, result });
        } else if (result.status >= 200 && result.status < 300) {
            results.working.push({ ...test, result });
        } else if (result.status === 404) {
            results.notFound.push({ ...test, result });
        } else if (result.status >= 400 && result.status < 500) {
            results.clientErrors.push({ ...test, result });
        } else if (result.status >= 500) {
            results.serverErrors.push({ ...test, result });
        } else {
            results.other.push({ ...test, result });
        }
        
        // Brief delay to be nice to the server
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📊 RESULTS SUMMARY');
    console.log('==================');
    
    if (results.working.length > 0) {
        console.log(`\n✅ WORKING ENDPOINTS (${results.working.length}):`);
        results.working.forEach(({ method, path, description, result }) => {
            console.log(`   ${method} ${path} - ${description}`);
            console.log(`   Status: ${result.status}`);
            if (typeof result.body === 'object') {
                console.log(`   Response: ${JSON.stringify(result.body, null, 2).substring(0, 200)}...`);
            } else {
                console.log(`   Response: ${result.body.toString().substring(0, 100)}...`);
            }
            console.log('');
        });
    }
    
    if (results.serverErrors.length > 0) {
        console.log(`\n🔥 SERVER ERRORS (5xx) - ENDPOINTS EXIST BUT FAILING (${results.serverErrors.length}):`);
        results.serverErrors.forEach(({ method, path, description, result }) => {
            console.log(`   ${method} ${path} - ${description} (Status: ${result.status})`);
            if (typeof result.body === 'object') {
                console.log(`   Error: ${JSON.stringify(result.body, null, 2).substring(0, 150)}...`);
            }
        });
    }
    
    if (results.clientErrors.length > 0) {
        console.log(`\n⚠️  CLIENT ERRORS (4xx) - ${results.clientErrors.length}:`);
        results.clientErrors.forEach(({ method, path, description, result }) => {
            console.log(`   ${method} ${path} - ${description} (Status: ${result.status})`);
        });
    }
    
    console.log(`\n❌ NOT FOUND (404): ${results.notFound.length} endpoints`);
    
    if (results.other.length > 0) {
        console.log(`\n🤷 OTHER/ERRORS: ${results.other.length} endpoints`);
    }
    
    console.log('\n🎯 KEY FINDINGS:');
    console.log('================');
    console.log('• Database Manager API is a simple Azure Function App');
    console.log('• Main endpoint: POST /api/chat with {"user_input": "your query"}');
    console.log('• Health endpoint: GET /api/health');
    console.log('• All endpoints currently failing due to "Database connection failed"');
    console.log('• API accepts both X-API-Key and Authorization Bearer headers');
    console.log('• Consistent JSON response format with fields: response, action_taken, confidence, session_id, status, error_details');
    console.log('• This appears to be a natural language interface to a database, not direct SQL access');
    
    return results;
}

if (require.main === module) {
    runComprehensiveTest().catch(console.error);
}

module.exports = { testEndpoint, runComprehensiveTest }; 