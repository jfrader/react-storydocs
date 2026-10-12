import { Select } from './Select';

const meta = {
  title: 'Primitives/Select',
  component: Select,
  args: {},
};

export default meta;

export const Default = {
  render: (args) => (
    <Select {...args}>
      <Select.Item value="a">Option A</Select.Item>
      <Select.Item value="b">Option B</Select.Item>
    </Select>
  ),
};

export const WithValue = { args: { value: 'a' } };
