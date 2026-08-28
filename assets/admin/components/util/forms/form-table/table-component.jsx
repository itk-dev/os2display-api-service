import { useTable } from "react-table";
import EditableCell from "./editable-cell";

// Set our editable cell renderer as the default Cell renderer
const defaultColumn = {
  Cell: EditableCell,
};

/**
 * The table, react-table
 *
 * @param {object} props The props.
 * @param {object} props.data The table data
 * @param {object} props.columns The table columns
 * @param {Function} props.updateTableData Callback on data change
 * @returns {object} The table component
 */
function TableComponent({ columns, data, updateTableData }) {
  const { getTableProps, getTableBodyProps, headerGroups, prepareRow, rows } =
    useTable({
      columns,
      data,
      defaultColumn,
      updateTableData,
    });

  return (
    <table className="table" {...getTableProps()}>
      <thead>
        {headerGroups.map((headerGroup) => {
          const { key: headerGroupKey, ...headerGroupProps } =
            headerGroup.getHeaderGroupProps();
          return (
            <tr key={headerGroupKey} {...headerGroupProps}>
              {headerGroup.headers.map((column) => {
                const { key: columnKey, ...columnProps } =
                  column.getHeaderProps();
                return (
                  <th key={columnKey} {...columnProps}>
                    {column.render("Header")}
                  </th>
                );
              })}
            </tr>
          );
        })}
      </thead>
      <tbody {...getTableBodyProps()}>
        {rows.map((row) => {
          prepareRow(row);
          const { key: rowKey, ...rowProps } = row.getRowProps();
          return (
            <tr key={rowKey} {...rowProps}>
              {row.cells.map((cell) => {
                const { key: cellKey, ...cellProps } = cell.getCellProps();
                return (
                  <td key={cellKey} {...cellProps}>
                    {cell.render("Cell")}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default TableComponent;
