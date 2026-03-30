from playwright.sync_api import sync_playwright
import time

def run_cuj(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(15)

    print("Checking for onboarding/welcome screens...")

    # 1. Welcome screen
    try:
        next_btn = page.locator("button:has-text('next')").last
        if next_btn.is_visible(timeout=5000):
            print("Clicking welcome next...")
            next_btn.click()
            time.sleep(2)
    except Exception as e:
        print("No welcome next", e)

    # 2. Name screen
    try:
        yuyuko = page.locator("button:has-text('Yuyuko')")
        if yuyuko.is_visible(timeout=2000):
            print("Selecting Yuyuko...")
            yuyuko.click()
            time.sleep(1)
            page.locator("button:has-text('next')").last.click()
            time.sleep(2)
    except:
        pass

    # 3. Model/Style selection
    try:
        # Just click the first option we find and next
        options = page.locator("button.border-border")  # general selectable card
        if options.count() > 0:
            print("Selecting first card...")
            options.first.click()
            time.sleep(1)
            page.locator("button:has-text('next')").last.click()
            time.sleep(2)
    except:
        pass

    # 4. Cloud screen ("which cloud?")
    try:
        # See if there's a skip option
        skip_btn = page.locator("button:has-text('skip')").last
        if skip_btn.is_visible(timeout=2000):
            print("Clicking skip cloud...")
            skip_btn.click()
            time.sleep(2)
        else:
            # Maybe local mode instead?
            local_btn = page.locator("button:has-text('Local Device')")
            if local_btn.is_visible(timeout=2000):
                print("Clicking local mode...")
                local_btn.click()
                time.sleep(1)
            # Try to find a continue without cloud or similar
            page.locator("button:has-text('next')").last.click()
            time.sleep(2)
    except:
        pass

    # Generic clicker for remaining screens
    for i in range(5):
        try:
            next_btn = page.locator("button:has-text('next')").last
            done_btn = page.locator("button:has-text('finish'), button:has-text('done'), button:has-text('start')").last
            skip_btn = page.locator("button:has-text('skip')").last

            if done_btn.is_visible(timeout=1000):
                print("Clicking done/start/finish...")
                done_btn.click()
                time.sleep(3)
                break
            elif skip_btn.is_visible(timeout=1000):
                print("Clicking skip...")
                skip_btn.click()
                time.sleep(2)
            elif next_btn.is_visible(timeout=1000):
                if next_btn.is_enabled():
                    print("Clicking next...")
                    next_btn.click()
                else:
                    # try clicking any main button
                    cards = page.locator("button.text-left") # frequently used for cards
                    if cards.count() > 0:
                        cards.first.click()
                        time.sleep(1)
                        next_btn.click()
                time.sleep(2)
        except Exception as e:
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
