const BACKEND_URL = 'http://localhost:3000';

async function benchmark(name, url) {
    const start = performance.now();
    try {
        const res = await fetch(url);
        const duration = (performance.now() - start).toFixed(2);
        if (res.ok) {
            const data = await res.json();
            console.log(`[PASS] ${name} responded in ${duration}ms (status: ${res.status}, items: ${Array.isArray(data) ? data.length : 'object'})`);
        } else {
            console.log(`[FAIL] ${name} returned status ${res.status} in ${duration}ms`);
        }
    } catch (err) {
        const duration = (performance.now() - start).toFixed(2);
        console.error(`[ERROR] ${name} failed in ${duration}ms:`, err.message);
    }
}

async function run() {
    console.log("=== Benchmarking Optimized API Endpoints ===");
    
    // First requests (Warm up / populate caches)
    console.log("\n--- Warm Up Round (Cache Misses) ---");
    await benchmark("Get All Users", `${BACKEND_URL}/api/users`);
    await benchmark("Get Rooms/Tags", `${BACKEND_URL}/api/tags`);
    await benchmark("Get Chatted Users", `${BACKEND_URL}/api/users/chatted?user_tag=samay`);
    await benchmark("Get Chat Summary", `${BACKEND_URL}/api/chats/summary?user_tag=samay`);

    // Second requests (Cache Hits)
    console.log("\n--- Cache Hits Round ---");
    await benchmark("Get All Users (Cached)", `${BACKEND_URL}/api/users`);
    await benchmark("Get Rooms/Tags (Cached)", `${BACKEND_URL}/api/tags`);
    await benchmark("Get Chatted Users (Cached)", `${BACKEND_URL}/api/users/chatted?user_tag=samay`);
    await benchmark("Get Chat Summary (Cached)", `${BACKEND_URL}/api/chats/summary?user_tag=samay`);
}

run();
