import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Mock API responses to bypass initialization
    page.route("**/api/onboarding/status", lambda route: route.fulfill(json={"complete": True}))
    page.route("**/api/onboarding/options", lambda route: route.fulfill(json={"options": []}))
    page.route("**/api/status", lambda route: route.fulfill(json={"state": "running", "agentName": "Milady"}))
    page.route("**/api/auth/status", lambda route: route.fulfill(json={"required": False, "pairingEnabled": False, "expiresAt": None}))
    page.route("**/api/workbench/overview", lambda route: route.fulfill(json={}))
    page.route("**/api/logs", lambda route: route.fulfill(json={"entries": []}))

    # Mock chat-related endpoints
    page.route("**/api/conversations", lambda route: route.fulfill(json={"conversations": [{"id": "c1", "title": "Chat 1"}]}))
    page.route("**/api/conversations/*/messages", lambda route: route.fulfill(json={"messages": [
        {"id": "m1", "role": "user", "text": "Hello", "timestamp": 1},
        {"id": "m2", "role": "assistant", "text": "Hi there!", "timestamp": 2}
    ]}))

    # Mock character
    page.route("**/api/character", lambda route: route.fulfill(json={"character": {"name": "Milady"}}))

    # Mock update status
    page.route("**/api/update/status", lambda route: route.fulfill(json={"channel": "dev", "currentVersion": "1.0.0", "latestVersion": "1.0.0", "updateAvailable": False}))

    # Mock wallet/inventory stuff to avoid errors
    page.route("**/api/wallet/*", lambda route: route.fulfill(json={}))
    page.route("**/api/plugins", lambda route: route.fulfill(json={"plugins": []}))
    page.route("**/api/skills", lambda route: route.fulfill(json={"skills": []}))

    print("Navigating to app...")
    try:
        page.goto("http://localhost:5173", timeout=60000)
    except Exception as e:
        print(f"Navigation failed: {e}")
        # Take screenshot anyway if possible
        page.screenshot(path="verification_failed.png")
        browser.close()
        return

    print("Waiting for chat input...")
    try:
        # Wait for textarea
        page.wait_for_selector("textarea", timeout=30000)

        # Type something
        page.fill("textarea", "Testing performance optimization")

        # Take screenshot
        page.screenshot(path="verification_chat.png")
        print("Screenshot saved to verification_chat.png")

    except Exception as e:
        print(f"Interaction failed: {e}")
        page.screenshot(path="verification_error.png")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
