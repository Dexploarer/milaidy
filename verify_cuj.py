from playwright.sync_api import sync_playwright
import time

def run_cuj(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(5)

    # Wait for the sidebar to be visible
    page.wait_for_selector("[data-testid='conversations-sidebar']", state="visible")
    time.sleep(2)

    # Click + New Chat
    page.get_by_role("button", name="+ New Chat").click()
    time.sleep(2)

    # Take screenshot at the key moment showing the sidebar
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    time.sleep(1)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            context.close()
            browser.close()
