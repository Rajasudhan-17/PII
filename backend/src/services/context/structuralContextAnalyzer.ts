import { IPIICandidate } from '../../models/piiCandidate.model';
import { INormalizedDocument, INormalizedBlock, INormalizedTable } from '../../models/normalizedDocument.model';
import {
  IStructuralContextMetadata,
  IDocumentSectionMetadata,
  IContextSignal,
} from '../../models/contextResult.model';

export interface StructuralAnalysisResult {
  structuralContext: IStructuralContextMetadata;
  documentSection?: IDocumentSectionMetadata;
  structuralSignals: IContextSignal[];
}

export class StructuralContextAnalyzer {
  public static analyze(
    candidate: IPIICandidate,
    normalizedDoc: INormalizedDocument,
    targetBlock: INormalizedBlock | null
  ): StructuralAnalysisResult {
    const structuralSignals: IContextSignal[] = [];
    const structuralContext: IStructuralContextMetadata = {
      isTable: false,
      isHeaderFooter: false,
      isForm: false,
    };
    let documentSection: IDocumentSectionMetadata | undefined;

    // 1. Header / Footer Check
    if (targetBlock && (targetBlock.type === 'HEADER' || targetBlock.type === 'FOOTER')) {
      structuralContext.isHeaderFooter = true;
      structuralSignals.push({
        signalType: 'STRUCTURAL_SIGNAL',
        weight: 0.25,
        provenance: `Candidate located inside document ${targetBlock.type.toLowerCase()}`,
        description: `Header/footer structural placement`,
      });
    }

    // 2. Section Heading Context
    if (targetBlock && normalizedDoc.blocks) {
      // Find nearest preceding HEADING block
      const prevHeadings = normalizedDoc.blocks.filter(
        (b) => b.type === 'HEADING' && b.readingOrderIndex < targetBlock.readingOrderIndex
      );
      if (prevHeadings.length > 0) {
        const nearestHeading = prevHeadings[prevHeadings.length - 1];
        documentSection = {
          headingText: nearestHeading.text,
          blockType: targetBlock.type,
          containerName: targetBlock.containerName,
        };
        structuralSignals.push({
          signalType: 'SECTION_MATCH',
          weight: 0.2,
          provenance: `Document section heading: '${nearestHeading.text}'`,
          description: `Preceding section heading context match`,
        });
      }
    }

    // 3. Table / Spreadsheet Context
    if (normalizedDoc.tables && normalizedDoc.tables.length > 0) {
      for (const table of normalizedDoc.tables) {
        const foundCellInfo = this.findCandidateInTable(candidate, table);
        if (foundCellInfo) {
          structuralContext.isTable = true;
          structuralContext.tableId = table.tableId;
          structuralContext.rowIndex = foundCellInfo.rowIndex;
          structuralContext.columnIndex = foundCellInfo.columnIndex;
          structuralContext.columnHeader = foundCellInfo.columnHeader;

          if (table.containerName && table.containerName.endsWith('.xlsx')) {
            structuralContext.isSpreadsheet = true;
            structuralContext.sheetName = table.containerName;
          }

          structuralSignals.push({
            signalType: 'TABLE_ROW_MATCH',
            weight: 0.3,
            provenance: `Table ID ${table.tableId}, Row ${foundCellInfo.rowIndex}, Col ${foundCellInfo.columnIndex}`,
            description: `Candidate is located in a structured table cell`,
          });
          break;
        }
      }
    }

    return {
      structuralContext,
      documentSection,
      structuralSignals,
    };
  }

  private static findCandidateInTable(
    candidate: IPIICandidate,
    table: INormalizedTable
  ): { rowIndex: number; columnIndex: number; columnHeader?: string } | null {
    let headerRow: { cells: Array<{ columnIndex: number; text: string }> } | null = null;
    if (table.rows.length > 0) {
      headerRow = table.rows.find((r) => r.cells.some((c) => c.isHeader)) || table.rows[0];
    }

    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.text && cell.text.includes(candidate.text)) {
          let columnHeader: string | undefined;
          if (headerRow) {
            const headerCell = headerRow.cells.find((h) => h.columnIndex === cell.columnIndex);
            if (headerCell) {
              columnHeader = headerCell.text;
            }
          }
          return {
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex,
            columnHeader,
          };
        }
      }
    }
    return null;
  }
}
