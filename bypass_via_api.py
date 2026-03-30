from playwright.sync_api import sync_playwright
import time

def run_test(page):
    page.goto("http://localhost:2138")
    time.sleep(15)

    print("Welcome screen...")
    # It might be waitable
    page.locator("button:has-text('next')").click()
    time.sleep(2)

    print("Finding a character button to click...")
    # the characters are not .text-left maybe. Let's get all buttons
    char = page.evaluate("""
        () => {
            const btns = Array.from(document.querySelectorAll('button'));
            const chars = btns.filter(b => b.textContent !== 'next' && b.textContent !== 'back' && b.textContent !== '');
            if(chars.length > 0) {
                chars[0].click();
                return chars[0].textContent;
            }
            return null;
        }
    """)
    print("Clicked character:", char)
    time.sleep(1)

    page.locator("button:has-text('next')").click()
    time.sleep(2)

    for step in range(15):
        text = page.evaluate("document.body.innerText")
        print("Step", step, "-", text[:50].replace('\n', ' '))

        # Check for done
        done_btn = page.locator("button:has-text('done'), button:has-text('finish'), button:has-text('start')")
        if done_btn.is_visible():
            print("Found done/finish/start")
            done_btn.first.click()
            time.sleep(3)
            break

        # Check skip
        skip_btn = page.locator("button:has-text('skip')")
        if skip_btn.is_visible():
            print("Clicking skip")
            skip_btn.click()
            time.sleep(2)
            continue

        # Check for next
        next_btn = page.locator("button:has-text('next')").last
        if next_btn.is_visible():
            if not next_btn.is_enabled():
                print("Next is disabled. Clicking an option...")
                # We need to click a specific option based on the text to ensure it's something we can actually continue from
                if "where should i live?" in text:
                    # Choose local (raw) or local (sandbox) to avoid cloud
                    try:
                        page.locator("button", has_text="local (raw)").click()
                    except:
                        try:
                            page.locator("button", has_text="local").first.click()
                        except:
                            pass
                elif "okay which cloud?" in text:
                    # Should not be here if we chose local, but click local device if present
                    try:
                        page.locator("button", has_text="Local Device").click()
                    except:
                        try:
                            page.locator("button").first.click()
                        except:
                            pass
                else:
                    # Click first valid option
                    clicked_opt = page.evaluate("""
                        () => {
                            const btns = Array.from(document.querySelectorAll('button'));
                            const valid = btns.filter(b => {
                                const t = b.textContent.toLowerCase().trim();
                                return t !== 'next' && t !== 'back' && t !== 'skip' && t !== '';
                            });
                            if (valid.length > 0) {
                                valid[0].click();
                                return valid[0].textContent;
                            }
                            return null;
                        }
                    """)
                    print("Clicked option:", clicked_opt)

                time.sleep(1)

            if next_btn.is_enabled():
                print("Clicking next")
                next_btn.click()
            else:
                print("Next is STILL disabled. Let's try another option.")
                # We might need to click the SECOND option.
                page.evaluate("""
                    () => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        const valid = btns.filter(b => {
                            const t = b.textContent.toLowerCase().trim();
                            return t !== 'next' && t !== 'back' && t !== 'skip' && t !== '';
                        });
                        if (valid.length > 1) {
                            valid[1].click();
                        } else if (valid.length > 0) {
                            valid[0].click();
                        }
                    }
                """)
                time.sleep(1)
                if next_btn.is_enabled():
                    next_btn.click()
                else:
                    print("Could not enable next.")
            time.sleep(2)
        else:
            print("No next button, trying to click any valid option...")
            time.sleep(2)

    print("Checking if sidebar is visible...")
    page.wait_for_selector("[data-testid='conversations-sidebar']", state="visible", timeout=15000)

    # Click + New Chat
    print("Clicking + New Chat")
    page.get_by_role("button", name="+ New Chat").click()
    time.sleep(2)

    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    print("Success")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="/home/jules/verification/videos")
        page = context.new_page()
        try:
            run_test(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            context.close()
            browser.close()
