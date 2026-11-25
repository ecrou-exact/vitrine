import '../../../dist/esm/vt-flowtime.js';

const element = document.getElementById('el');
const dialog = document.getElementById('host-dialog');
document
  .getElementById('light')
  .addEventListener('click', () => element.setAttribute('theme', 'light'));
document
  .getElementById('dark')
  .addEventListener('click', () => element.setAttribute('theme', 'dark'));
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
element.options = {
  actions: [{ id: 'add', label: 'Add event', onClick: () => dialog.showModal() }],
  customViews: [
    {
      id: 'graph',
      label: 'Graph',
      icon: '⌘',
      filters: false,
      inspector: false,
      mount(container) {
        const title = document.createElement('h2');
        title.textContent = 'Host-owned Graph renderer';
        container.append(title);
        document.getElementById('graph-state').textContent = 'Graph mounted';
        return {
          destroy() {
            document.getElementById('graph-state').textContent = 'Graph cleaned up';
          },
        };
      },
    },
  ],
};
