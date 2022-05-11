import styled from 'styled-components';

export const TodoInput = styled.input`
  padding: 16px 16px 16px 60px;
  height: 65px;
  border: none;
  background: #fff;
  box-shadow: inset 0 -2px 1px rgb(0 0 0 / 3%);
  &:focus {
    outline: none;
    box-shadow: 0px 0px 2px red;
  }
`;

export const FullSizeBox = styled.div`
  display: flex;
  width: 100%;
  align-items: stretch;
  flex-direction: column;
`;
export const TodoHeader = FullSizeBox;
export const TodoMain = styled.div`
  z-index: 2;
  border-top: 1px solid #e6e6e6;
  margin: 1px;
`;

export const FlexBox = styled.div`
  display: flex;
`;

export const TodoItemList = styled.ul`
  display: flex;
  width: 100%;
  align-items: stretch;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const TodoItemBox = styled.li`
  display: flex;
  width: 100%;
  align-items: stretch;
  flex-direction: row;
  justify-content: space-between;
  font-size: 24px;
  background: #fff;
  border-bottom: 1px solid #ededed;
  &:last-child {
    border-bottom: none;
  }
`;

export const ToggleCheckbox = styled.input`
  text-align: center;
  min-width: 40px;
  height: 40px;
  display: flex;
  top: 0;
  bottom: 0;
  margin: auto 0;
  border: none;
  appearance: none;
  opacity: 0;
  &:checked + label {
    background-image: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%22-10%20-18%20100%20135%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2250%22%20fill%3D%22none%22%20stroke%3D%22%2359A193%22%20stroke-width%3D%223%22%2F%3E%3Cpath%20fill%3D%22%233EA390%22%20d%3D%22M72%2025L42%2071%2027%2056l-4%204%2020%2020%2034-52z%22%2F%3E%3C%2Fsvg%3E');
    text-decoration: line-through;
    color: #949494;
  }
`;
export const TodoItemLabel = styled.label`
  word-break: break-all;
  padding: 15px 15px 15px 60px;
  margin-left: -40px;
  display: block;
  line-height: 1.2;
  transition: color 0.4s;
  font-weight: 400;
  color: #484848;
  background-image: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%22-10%20-18%20100%20135%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2250%22%20fill%3D%22none%22%20stroke%3D%22%23949494%22%20stroke-width%3D%223%22/%3E%3C/svg%3E');
  background-repeat: no-repeat;
  background-position: center left;
`;
export const DestroyButton = styled.button`
  display: flex;
  width: 40px;
  font-size: 30px;
  color: #949494;
  background-color: #fff;
  border: none;
  transition: opacity 0.2s ease-out;
  opacity: 0;
  &:hover {
    opacity: 1;
  }
  &:after {
    content: '×';
    display: flex;
    height: 100%;
    align-items: center;
  }
`;
