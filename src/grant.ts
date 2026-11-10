const btn = document.getElementById('grant') as HTMLButtonElement;
const result = document.getElementById('result') as HTMLParagraphElement;

btn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    result.textContent =
      'Camera access granted. Close this tab and reopen the Gaze side panel.';
  } catch (err) {
    result.textContent =
      `Camera access failed (${err}). Check chrome://settings/content/camera ` +
      'and the site settings for this extension.';
  }
});
