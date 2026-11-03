# Extracted from a larger private codebase (CALLIOPE). Source: services/document/convert.py; adapted: removed private governance reference; optional Docling remains local-only by default.
import os
import sys
import json
import argparse
from pathlib import Path


TEXT_EXTENSIONS = {".txt", ".html", ".htm", ".md", ".markdown"}


def configure_docling_network_policy():
    """Make model access explicit and fail closed by default.

    Docling can otherwise ask RapidOCR/ModelScope/Hugging Face for weights while
    converting a local file. CALLIOPE is local-first, so a conversion may use
    already-present artifacts but must never initiate a download implicitly.
    An explicitly opt-in run can set
    ``DOCLING_ALLOW_REMOTE_MODELS=1`` for a one-off provisioning operation.
    """
    allow_remote = os.environ.get("DOCLING_ALLOW_REMOTE_MODELS", "").strip().lower()
    if allow_remote not in {"1", "true", "yes"}:
        # These are understood by the relevant model clients. Set, rather than
        # setdefault, so a caller cannot accidentally weaken the local-only gate.
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["MODELSCOPE_OFFLINE"] = "1"


def build_docling_converter(input_path):
    """Return a converter configured for the requested local document.

    Embedded-text PDFs do not need OCR/layout/table models. Disabling those
    stages keeps the normal path deterministic and avoids an implicit artifact
    fetch. Other formats retain Docling's native parser, but inherit the same
    offline policy and therefore fail clearly when a required local artifact is
    absent.
    """
    from docling.document_converter import DocumentConverter

    if Path(input_path).suffix.lower() != ".pdf":
        return DocumentConverter()

    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import PdfFormatOption

    artifacts_path = os.environ.get("DOCLING_ARTIFACTS_PATH", "").strip()
    if artifacts_path:
        artifacts_dir = Path(artifacts_path).expanduser()
        if not artifacts_dir.is_dir():
            raise RuntimeError(
                "DOCLING_ARTIFACTS_PATH must point to an existing local directory"
            )
        artifacts_path = str(artifacts_dir)

    pipeline_options = PdfPipelineOptions(
        artifacts_path=artifacts_path or None,
        enable_remote_services=False,
        do_ocr=False,
        do_table_structure=False,
        force_backend_text=True,
    )
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF],
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        },
    )


def write_text_fallback(input_path, markdown_path, json_path, root_name, base_name):
    with open(input_path, "r", encoding="utf-8", errors="strict") as source:
        content = source.read()

    markdown_content = f"""# {root_name}

{content}

---
*Conversion Metadata*
- Source File: {base_name}
- Converter: Plain Text Fallback
"""
    with open(markdown_path, "w", encoding="utf-8") as output:
        output.write(markdown_content)

    json_data = {
        "document": {
            "name": root_name,
            "pages": 1,
            "sections": [{"heading": root_name, "text": content}],
            "converter": "plain-text-fallback",
        }
    }
    with open(json_path, "w", encoding="utf-8") as output:
        json.dump(json_data, output, indent=2, ensure_ascii=False)


def convert_document(input_path, output_dir):
    if not os.path.isfile(input_path):
        print(f"Input file does not exist: {input_path}", file=sys.stderr)
        return 1

    os.makedirs(output_dir, exist_ok=True)
    
    # Define output file paths
    base_name = os.path.basename(input_path)
    root_name, ext = os.path.splitext(base_name)
    markdown_path = os.path.join(output_dir, f"{root_name}.md")
    json_path = os.path.join(output_dir, f"{root_name}.json")
    
    print(f"Converting {input_path} to {output_dir}...")
    sys.stdout.flush()

    if ext.lower() in TEXT_EXTENSIONS:
        try:
            write_text_fallback(
                input_path,
                markdown_path,
                json_path,
                root_name,
                base_name,
            )
            print("Conversion completed using the plain-text converter.")
            return 0
        except (OSError, UnicodeError) as error:
            print(f"Error reading text document: {error}", file=sys.stderr)
            return 1

    try:
        # Attempt to use real Docling if installed. The network policy is
        # configured before importing model-backed components.
        configure_docling_network_policy()
        converter = build_docling_converter(input_path)
        result = converter.convert(input_path)
        
        # Save markdown
        markdown_content = result.document.export_to_markdown()
        with open(markdown_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
            
        # Save standard dict JSON representation
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(result.document.export_to_dict(), f, indent=2, ensure_ascii=False)
            
        print("Conversion completed successfully using Docling.")
        return 0
    except ImportError:
        print(
            f"Docling is required to convert {ext or 'this file type'}. "
            "Install services/document/requirements.txt and retry.",
            file=sys.stderr,
        )
        return 1
    except Exception as e:
        print(f"Error converting document locally: {str(e)}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to input document")
    parser.add_argument("--output", required=True, help="Directory to save conversion outputs")
    args = parser.parse_args()
    
    sys.exit(convert_document(args.input, args.output))
