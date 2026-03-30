from playwright.sync_api import sync_playwright
import time

def run_cuj(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(15)

    print("Checking for onboarding/welcome screens...")

    for step in range(15):
        # Let's inspect the page content to know what to do
        text = page.evaluate("document.body.innerText")

        # Determine the active buttons on this screen
        next_btn = page.locator("button", has_text="next")
        done_btn = page.locator("button:has-text('done'), button:has-text('finish'), button:has-text('start')")
        skip_btn = page.locator("button", has_text="skip")

        if "what's my name again?" in text:
            print("Name screen...")
            page.locator("button", has_text="Yuyuko").click()
            time.sleep(1)
            next_btn.click()
            time.sleep(2)
        elif "whats my vibe?" in text:
            print("Vibe screen...")
            page.locator("button", has_text="uwu~").click()
            time.sleep(1)
            next_btn.click()
            time.sleep(2)
        elif "okay which cloud?" in text:
            print("Cloud screen...")
            if skip_btn.is_visible():
                skip_btn.click()
            else:
                page.locator("button", has_text="Local Device").click()
                time.sleep(1)
                next_btn.click()
            time.sleep(2)
        elif "who should i be?" in text:
            print("Persona screen...")
            page.locator("button", has_text="Local Device").click()
            time.sleep(1)
            next_btn.click()
            time.sleep(2)
        else:
            if done_btn.is_visible():
                print("Clicking done/start/finish...")
                done_btn.first.click()
                time.sleep(3)
            elif skip_btn.is_visible():
                print("Clicking skip...")
                skip_btn.click()
                time.sleep(2)
            elif next_btn.is_visible():
                if next_btn.is_enabled():
                    print("Clicking next...")
                    next_btn.click()
                    time.sleep(2)
                else:
                    # Select the first option card that is not back/next
                    print("Clicking generic option to enable next...")
                    # Get all buttons except back and next
                    options = page.evaluate("""
                        () => Array.from(document.querySelectorAll('button'))
                            .filter(b => !b.textContent.toLowerCase().includes('back') && !b.textContent.toLowerCase().includes('next'))
                            .map(b => b.textContent)
                    """)
                    if len(options) > 0:
                        print("Options available:", options)
                        # click the first one
                        page.locator(f"button:has-text('{options[0]}')").first.click()
                        time.sleep(1)
                        next_btn.click()
                        time.sleep(2)
                    else:
                        print("Can't find option to select")
            else:
                print("No navigation buttons found, assuming onboarding complete.")
                break

    print("Current text:", page.evaluate("document.body.innerText")[:500])

    # Wait for the sidebar to be visible
    print("Waiting for sidebar...")
    try:
        page.wait_for_selector("[data-testid='conversations-sidebar']", state="visible", timeout=10000)
        print("Clicking + New Chat")
        page.get_by_role("button", name="+ New Chat").click()
        time.sleep(2)
    except Exception as e:
        print("Sidebar still not visible. Retrying generic buttons just in case...", e)
        time.sleep(5)

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
