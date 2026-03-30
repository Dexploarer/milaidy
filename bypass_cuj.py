from playwright.sync_api import sync_playwright
import time

def run_cuj(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(5)

    print("Checking for onboarding/welcome screens...")
    # Click next if onboarding is present
    try:
        # We might need to click "next" a few times or click "Skip"
        for i in range(5):
            next_btn = page.get_by_role("button", name="next", exact=True)
            if next_btn.is_visible(timeout=2000):
                print("Clicking 'next'")
                next_btn.click()
                time.sleep(2)
            else:
                break
    except Exception as e:
        print("No more next buttons or error:", e)

    try:
        skip_btn = page.get_by_role("button", name="skip", exact=False)
        if skip_btn.is_visible(timeout=2000):
            print("Clicking 'skip'")
            skip_btn.click()
            time.sleep(2)
    except:
        pass

    try:
        done_btn = page.get_by_role("button", name="done", exact=False)
        if done_btn.is_visible(timeout=2000):
            print("Clicking 'done'")
            done_btn.click()
            time.sleep(2)
    except:
        pass

    try:
        start_btn = page.get_by_role("button", name="start", exact=False)
        if start_btn.is_visible(timeout=2000):
            print("Clicking 'start'")
            start_btn.click()
            time.sleep(2)
    except:
        pass

    try:
        continue_btn = page.get_by_role("button", name="continue", exact=False)
        if continue_btn.is_visible(timeout=2000):
            print("Clicking 'continue'")
            continue_btn.click()
            time.sleep(2)
    except:
        pass

    print("Current text:", page.evaluate("document.body.innerText")[:500])

    # Wait for the sidebar to be visible
    print("Waiting for sidebar...")
    page.wait_for_selector("[data-testid='conversations-sidebar']", state="visible", timeout=15000)
    time.sleep(2)

    # Click + New Chat
    print("Clicking + New Chat")
    page.get_by_role("button", name="+ New Chat").click()
    time.sleep(2)

    # Take screenshot at the key moment showing the sidebar
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    time.sleep(1)
    print("Success")

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
