from playwright.sync_api import sync_playwright
import time

def run_cuj(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(15)

    print("Checking for onboarding/welcome screens...")

    # 1. First screen: welcome
    print("Welcome screen...")
    next_btn = page.locator("button:has-text('next')")
    if next_btn.is_visible(timeout=2000):
        next_btn.click()
        time.sleep(2)

    # 2. Second screen: "what's my name again?"
    print("Name screen...")
    # Click one of the names, like "Yuyuko"
    yuyuko = page.locator("button:has-text('Yuyuko')")
    if yuyuko.is_visible(timeout=2000):
        yuyuko.click()
        time.sleep(1)
        next_btn = page.locator("button:has-text('next')")
        next_btn.click()
        time.sleep(2)

    # Let's loop a few more times to get through the rest of the wizard if needed
    for i in range(5):
        try:
            next_btn = page.locator("button:has-text('next')").last
            if next_btn.is_visible(timeout=2000):
                if next_btn.is_enabled():
                    print("Clicking 'next'")
                    next_btn.click()
                    time.sleep(2)
                else:
                    # Let's see if there's an option to click to enable it
                    print("Next is disabled, clicking first option...")
                    # just click the first button that isn't next or back
                    options = page.locator("button:not(:has-text('next')):not(:has-text('back'))")
                    if options.count() > 0:
                        options.first.click()
                        time.sleep(1)
                        next_btn.click()
                        time.sleep(2)
            else:
                break
        except Exception as e:
            print("Loop error:", e)

    # Look for 'done' or 'finish'
    try:
        done_btn = page.locator("button:has-text('done'), button:has-text('finish'), button:has-text('start')").last
        if done_btn.is_visible(timeout=2000):
            print("Clicking done/finish/start")
            done_btn.click()
            time.sleep(3)
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
