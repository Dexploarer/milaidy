from playwright.sync_api import sync_playwright

def test_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:2138/")
            page.wait_for_timeout(5000)

            # Hover over a conversation to reveal the delete button
            conv_items = page.locator('[data-testid="conv-item"]')
            if conv_items.count() > 0:
                conv_items.first.hover()
                page.wait_for_timeout(1000)

            page.screenshot(path="verification.png")
            print("Screenshot saved to verification.png")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_ui()
