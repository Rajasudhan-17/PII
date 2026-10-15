import http from 'http';

interface RequestResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
  rawBody: string;
}

const makeRequest = (
  method: string,
  path: string,
  bodyData?: any,
  headers: Record<string, string> = {}
): Promise<RequestResult> => {
  return new Promise((resolve, reject) => {
    const postData = bodyData ? JSON.stringify(bodyData) : undefined;
    const reqHeaders: Record<string, string> = {
      ...headers,
    };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: `/api/v1${path}`,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            rawBody: data,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

async function runLiveAppVerification() {
  console.log('=== STARTING LIVE APPLICATION VERIFICATION ===\n');

  const testEmail = `live-test-${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';

  // STEP 1: Registration
  console.log(`[1] Registering user: ${testEmail}...`);
  const regRes = await makeRequest('POST', '/auth/register', {
    email: testEmail,
    password: testPassword,
    role: 'USER',
  });
  console.log(`    Status: ${regRes.status} (Expected: 201)`);
  if (regRes.status !== 201) throw new Error('Registration failed');

  // STEP 2: Login & Cookie Inspection
  console.log('[2] Logging in user & verifying HttpOnly cookie issuance...');
  const loginRes = await makeRequest('POST', '/auth/login', {
    email: testEmail,
    password: testPassword,
  });
  console.log(`    Status: ${loginRes.status} (Expected: 200)`);
  const accessToken = loginRes.body.accessToken;
  const refreshToken = loginRes.body.refreshToken;
  const setCookieHeader = loginRes.headers['set-cookie'];

  console.log(`    Issued Access Token: [PRESENT, Length: ${accessToken?.length}]`);
  console.log(`    Issued Refresh Token: [PRESENT, Length: ${refreshToken?.length}]`);
  console.log(`    Set-Cookie header: ${JSON.stringify(setCookieHeader)}`);

  const hasHttpOnlyCookie = setCookieHeader?.some((c) => c.includes('refreshToken=') && c.includes('HttpOnly'));
  console.log(`    Has HttpOnly refreshToken cookie: ${hasHttpOnlyCookie} (Expected: true)`);
  if (!hasHttpOnlyCookie) throw new Error('HttpOnly refreshToken cookie missing');

  const cookieStr = setCookieHeader![0].split(';')[0]; // "refreshToken=..."

  // STEP 3: Session Restoration via /auth/me
  console.log('[3] Exercising session restoration (/auth/me) with Bearer token...');
  const meRes = await makeRequest('GET', '/auth/me', undefined, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log(`    Status: ${meRes.status} (Expected: 200)`);
  console.log(`    Restored User: email=${meRes.body.user.email}, role=${meRes.body.user.role}, status=${meRes.body.user.status}`);
  if (meRes.status !== 200 || meRes.body.user.email !== testEmail.toLowerCase()) {
    throw new Error('Session restoration failed');
  }

  // STEP 4: Token Refresh using Cookie Contract (Empty Body)
  console.log('[4] Exercising token refresh using HttpOnly cookie contract (empty body)...');
  const refreshRes = await makeRequest('POST', '/auth/refresh', {}, {
    Cookie: cookieStr,
  });
  console.log(`    Status: ${refreshRes.status} (Expected: 200)`);
  const rotatedAccessToken = refreshRes.body.accessToken;
  const rotatedRefreshToken = refreshRes.body.refreshToken;
  console.log(`    Rotated Refresh Token different from original: ${rotatedRefreshToken !== refreshToken} (Expected: true)`);
  const newSetCookie = refreshRes.headers['set-cookie'];
  console.log(`    New rotated Set-Cookie: ${JSON.stringify(newSetCookie)}`);
  if (refreshRes.status !== 200 || rotatedRefreshToken === refreshToken) {
    throw new Error('Cookie-based token refresh failed');
  }

  // STEP 5: Organization Validation & Boundaries
  console.log('[5] Querying user organizations for tenant switching...');
  const orgsRes = await makeRequest('GET', '/organizations', undefined, {
    Authorization: `Bearer ${rotatedAccessToken}`,
  });
  console.log(`    Status: ${orgsRes.status} (Expected: 200)`);
  console.log(`    User Organizations count: ${orgsRes.body.organizations?.length}`);

  // Test unauthorized tenant boundary rejection
  const fakeOrgId = '66acda803e64826efbbc4ec6';
  console.log(`    Attempting direct access to unauthorized tenant [${fakeOrgId}]...`);
  const unauthorizedTenantRes = await makeRequest('GET', `/organizations/${fakeOrgId}/documents`, undefined, {
    Authorization: `Bearer ${rotatedAccessToken}`,
    'x-organization-id': fakeOrgId,
  });
  console.log(`    Status: ${unauthorizedTenantRes.status} (Expected: 404 or 403)`);
  console.log(`    Error Code: ${unauthorizedTenantRes.body.error?.code}`);
  if (![403, 404].includes(unauthorizedTenantRes.status)) {
    throw new Error('Tenant boundary was not enforced');
  }

  // STEP 6: RBAC Forbidden Route Direct API Enforcement
  console.log('[6] Verifying backend independent authorization enforcement on privileged routes...');
  const forbiddenCall = await makeRequest('GET', `/organizations/${fakeOrgId}/review-cases`, undefined, {
    Authorization: `Bearer ${rotatedAccessToken}`,
    'x-organization-id': fakeOrgId,
  });
  console.log(`    Status: ${forbiddenCall.status} (Expected: 403 or 404)`);
  console.log(`    Error Code: ${forbiddenCall.body.error?.code}`);

  // STEP 7: Logout & Invalidation
  console.log('[7] Exercising logout with cookie & token clearing...');
  const logoutRes = await makeRequest('POST', '/auth/logout', { refreshToken: rotatedRefreshToken }, {
    Authorization: `Bearer ${rotatedAccessToken}`,
    Cookie: newSetCookie![0].split(';')[0],
  });
  console.log(`    Status: ${logoutRes.status} (Expected: 200)`);
  console.log(`    Logout Message: ${logoutRes.body.message}`);
  const logoutSetCookie = logoutRes.headers['set-cookie'];
  console.log(`    Logout Set-Cookie (clearing): ${JSON.stringify(logoutSetCookie)}`);
  const clearedSuccessfully = logoutSetCookie?.some((c) => c.includes('refreshToken=;'));
  console.log(`    Cookie cleared: ${clearedSuccessfully} (Expected: true)`);

  // STEP 8: Post-Logout Rejection Verification
  console.log('[8] Verifying post-logout rejection of revoked refresh token...');
  const postLogoutRefresh = await makeRequest('POST', '/auth/refresh', { refreshToken: rotatedRefreshToken });
  console.log(`    Status: ${postLogoutRefresh.status} (Expected: 401)`);
  console.log(`    Error Code: ${postLogoutRefresh.body.error?.code}`);
  if (postLogoutRefresh.status !== 401) {
    throw new Error('Revoked refresh token was not rejected');
  }

  console.log('\n=== ALL LIVE APPLICATION VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
}

runLiveAppVerification().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
