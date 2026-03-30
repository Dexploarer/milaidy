from playwright.sync_api import sync_playwright
import time

def run_test(page):
    page.goto("http://localhost:2138")
    time.sleep(10)

    # Let's bypass onboarding simply by injecting a local storage state
    print("Setting localStorage onboardingComplete=true...")
    page.evaluate("localStorage.setItem('milady_onboarding_complete', 'true')")
    page.evaluate("localStorage.setItem('milady_auth_token', 'dev-token')")
    page.evaluate("localStorage.setItem('milady_auth_required', 'false')")

    # Reload page
    print("Reloading...")
    page.reload()
    time.sleep(5)

    print("Current text:", page.evaluate("document.body.innerText")[:500])

    print("Waiting for sidebar...")
    try:
        page.wait_for_selector("[data-testid='conversations-sidebar']", state="visible", timeout=10000)
    except Exception as e:
        print("Still no sidebar:", e)
        # Try to find a way out of whatever screen we are in
        if "what's my name again?" in page.evaluate("document.body.innerText"):
            print("Still in onboarding... it didn't bypass.")

            # 1. Click Next (Welcome)
            print("Clicking next...")
            page.locator("button:has-text('next')").click()
            time.sleep(2)

            # 2. Character
            print("Finding characters...")
            chars = page.evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent)")
            char = [c for c in chars if c not in ["next", "back", ""]][0]
            page.evaluate(f"Array.from(document.querySelectorAll('button')).find(b => b.textContent === '{char}').click()")
            time.sleep(1)
            page.locator("button:has-text('next')").click()
            time.sleep(2)

            # 3. Custom Persona (some have Add new persona)
            print("Finding persona...")
            options = page.evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent).filter(t => t !== 'next' && t !== 'back' && t !== '')")
            if "Add new persona" in options:
                print("Clicking Add new persona")
                page.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Add new persona').click()")
                time.sleep(1)
                page.locator("button:has-text('next')").click()
                time.sleep(2)

            # 4. Vibe
            options = page.evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent).filter(t => t !== 'next' && t !== 'back' && t !== '')")
            if len(options) > 0:
                print("Clicking vibe:", options[0])
                page.evaluate(f"Array.from(document.querySelectorAll('button')).find(b => b.textContent === '{options[0]}').click()")
                time.sleep(1)
                page.locator("button:has-text('next')").click()
                time.sleep(2)

            # 5. Theme
            options = page.evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent).filter(t => t !== 'next' && t !== 'back' && t !== '')")
            if len(options) > 0:
                print("Clicking theme:", options[0])
                page.evaluate(f"Array.from(document.querySelectorAll('button')).find(b => b.textContent === '{options[0]}').click()")
                time.sleep(1)
                page.locator("button:has-text('next')").click()
                time.sleep(2)

            # 6. Mode
            options = page.evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent).filter(t => t !== 'next' && t !== 'back' && t !== '')")
            if len(options) > 0:
                print("Clicking mode:", options[-1])
                page.evaluate(f"Array.from(document.querySelectorAll('button')).find(b => b.textContent === '{options[-1]}').click()")
                time.sleep(1)
                page.locator("button:has-text('next')").click()
                time.sleep(2)

            # Finish up loop
            for i in range(5):
                options = page.evaluate("Array.from(document.querySelectorAll('button')).map(b => b.textContent).filter(t => t !== 'next' && t !== 'back' && t !== '')")
                if len(options) > 0:
                    page.evaluate(f"Array.from(document.querySelectorAll('button')).find(b => b.textContent === '{options[-1]}').click()")
                    time.sleep(1)

                try:
                    if page.locator("button:has-text('done')").is_visible():
                        print("Clicking done")
                        page.locator("button:has-text('done')").click()
                        time.sleep(3)
                        break
                    elif page.locator("button:has-text('start')").is_visible():
                        print("Clicking start")
                        page.locator("button:has-text('start')").click()
                        time.sleep(3)
                        break
                    elif page.locator("button:has-text('skip')").is_visible():
                        print("Clicking skip")
                        page.locator("button:has-text('skip')").click()
                        time.sleep(2)
                    elif page.locator("button:has-text('next')").is_visible():
                        print("Clicking next")
                        page.locator("button:has-text('next')").click()
                        time.sleep(2)
                except:
                    pass

    page.wait_for_selector("[data-testid='conversations-sidebar']", state="visible", timeout=10000)
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    print("Success")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            run_test(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            context.close()
            browser.close()
