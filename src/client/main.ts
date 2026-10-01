import './style.css';

const content = document.querySelector<HTMLElement>('#content');
if (content) {
  content.innerHTML = '<h1>mkserve</h1><p>Scaffold is running.</p>';
}
