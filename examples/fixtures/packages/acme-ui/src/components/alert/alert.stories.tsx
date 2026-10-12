import { Alert } from './Alert';

const meta = {
  title: 'Feedback/Alert',
  component: Alert,
  argTypes: {
    tone: {
      control: 'select',
      options: ['info', 'success', 'warning', 'danger'],
    },
  },
  render: (args) => <Alert {...args}>This is an alert message with custom render.</Alert>,
};

export default meta;

export const Info = { args: { tone: 'info' } };

export const Success = { args: { tone: 'success' } };

export const Warning = { args: { tone: 'warning' } };

export const Danger = { args: { tone: 'danger' } };
