import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, LayoutGrid, List } from "lucide-react";
import type { SortBy } from "../lib/utils";
import { Button } from "./ui/button";

export function ViewOptions({
  view,
  onViewChange,
  sort,
  onSort,
  direction,
  onDirectionChange,
  showKind,
  onShowKindChange,
}: {
  view: "list" | "grid";
  onViewChange: (view: "list" | "grid") => void;
  sort: SortBy;
  onSort: (sort: SortBy) => void;
  direction: "asc" | "desc";
  onDirectionChange: (direction: "asc" | "desc") => void;
  showKind: boolean;
  onShowKindChange: (show: boolean) => void;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button className="view-options-button" aria-label="View options">
          {view === "list" ? <List /> : <LayoutGrid />}
          <ChevronDown className="view-options-chevron" />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="menu" align="end" sideOffset={6}>
          <Dropdown.Label className="menu-label">View</Dropdown.Label>
          <Dropdown.RadioGroup
            value={view}
            onValueChange={(value) => onViewChange(value as typeof view)}
          >
            {(["list", "grid"] as const).map((value) => (
              <Dropdown.RadioItem
                className="menu-item"
                key={value}
                value={value}
              >
                {value === "list" ? (
                  <List size={15} />
                ) : (
                  <LayoutGrid size={15} />
                )}
                <span>{value === "list" ? "List" : "Grid"}</span>
                <Dropdown.ItemIndicator>
                  <Check size={14} />
                </Dropdown.ItemIndicator>
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
          <Dropdown.Separator className="menu-separator" />
          <Dropdown.Label className="menu-label">Sort by</Dropdown.Label>
          {(["name", "modified", "size", "type"] as const).map((column) => (
            <Dropdown.Item
              className="menu-item"
              key={column}
              onSelect={() => onSort(column)}
            >
              <span>
                {
                  {
                    name: "Name",
                    modified: "Date Modified",
                    size: "Size",
                    type: "Kind",
                  }[column]
                }
              </span>
              {sort === column && <Check size={14} />}
            </Dropdown.Item>
          ))}
          <Dropdown.Separator className="menu-separator" />
          <Dropdown.RadioGroup
            value={direction}
            onValueChange={(value) =>
              onDirectionChange(value as typeof direction)
            }
          >
            {(["asc", "desc"] as const).map((value) => (
              <Dropdown.RadioItem
                className="menu-item"
                key={value}
                value={value}
              >
                <span>{value === "asc" ? "Ascending" : "Descending"}</span>
                <Dropdown.ItemIndicator>
                  <Check size={14} />
                </Dropdown.ItemIndicator>
              </Dropdown.RadioItem>
            ))}
          </Dropdown.RadioGroup>
          {view === "list" && (
            <>
              <Dropdown.Separator className="menu-separator" />
              <Dropdown.CheckboxItem
                className="menu-item"
                checked={showKind}
                onCheckedChange={onShowKindChange}
              >
                <span>Show Kind column</span>
                <Dropdown.ItemIndicator>
                  <Check size={14} />
                </Dropdown.ItemIndicator>
              </Dropdown.CheckboxItem>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
