import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

/** 비중(%)→Cell 수 변환표 한 구간("이상~미만"). */
export class CellMappingEntryDto {
	@IsNumber()
	@Min(0)
	@Max(100)
	ratioFrom: number;

	@IsNumber()
	@Min(0)
	@Max(100)
	ratioTo: number;

	@IsInt()
	@Min(0)
	cellCount: number;
}

/** PUT /rbfr-api/cell-rule-limits/:ruleVersion/mapping 본문. 기존 구간을 통째로 교체한다. */
export class SetCellMappingDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CellMappingEntryDto)
	entries: CellMappingEntryDto[];
}
