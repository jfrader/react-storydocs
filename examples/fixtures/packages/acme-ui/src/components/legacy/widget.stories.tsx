import { Widget, type WidgetProps } from '../../legacy-src/Widget';

const meta = { title: 'Primitives/Widget', component: Widget };
export default meta;

const Template = (args: WidgetProps) => <Widget {...args}>Slot content</Widget>;
type LegacyStory = typeof Template & { args?: WidgetProps };
export const Default: LegacyStory = Template.bind({});
Default.args = { label: 'Records', count: 3 };
export const Disabled: LegacyStory = Template.bind({});
Disabled.args = { label: 'Records', count: 3, disabled: true };
