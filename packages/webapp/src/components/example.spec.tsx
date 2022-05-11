import React from 'react';
import renderer from 'react-test-renderer';
import LoadingScreen from './LoadingScreen';

it('renders correctly', () => {
  const tree = renderer.create(<LoadingScreen />).toJSON();
  expect(tree).toMatchSnapshot();
});
