import { MuiField } from '../../mui/MuiField';

const meta = {
  title: 'Primitives/MuiField',
  component: MuiField,
  args: { label: 'Name' },
};

export default meta;

export const Default = {};

export const WithHint = { args: { hint: 'Use your legal name.' } };
