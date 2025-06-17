# Axioms

## HLA.01 
Prompt Injection (direct or indirect) is the primary delivery mechanism for adversarial prompt attacks. All observed LLM exploitation in this taxonomy occurs through the act of crafting and submitting inputs to the model.

## HLA.02 
The content of a prompt (or sequence of prompts) defines what specific methods or manipulations an attacker used within a prompt. These map to Techniques.

## HLA.03 
The common features that define how Techniques exploit vulnerabilities or weaknesses in model architecture, inference, safety mechanisms, and so on map to Tactics.

## HLA.04 
Intent can only be inferred, unless you are the attacker. Malicious intents map why an attacker is conducting the operation map to Objectives.

## HLA.05 
Prompts can be multi-faceted. A single prompt may utilize multiple Techniques and, as a result, multiple associated Tactics.

## HLA.06 
There is inherent overlap between malicious and benign prompts. Some techniques or tactics may appear in legitimate use cases, making contextual analysis and system behavior critical for distinguishing intent.

## HLA.07 
Benign prompts can still be tagged with Tactics and Techniques (i.e. the presence of a tactic or technique does not by itself indicate maliciousness).

## HLA.08 
Adversarial Tactics, Techniques, and Prompts (TTPs) should be compatible with frameworks, such as MITRE ATLAS, OWASP Top 10 for LLMs, LM Cyber Kill Chain, and others.

## HLA.09 
Impact is observed.

## HLA.10 
Some malicious prompts may involve no special tactics or techniques at all. They may simply issue direct instructions.

## HLA.11 
The boundaries between Techniques and Tactics are often vague. These categories are functional abstractions and may exhibit overlap or ambiguity in complex or novel cases.



### Back to APE
[[APE/APE.md|APE]]
