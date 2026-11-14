-- Drops continuations asked by the reverted "cold" kind (removed in 0349107a41); main refuses that kind at boot.
DELETE FROM `continuations` WHERE json_extract(`asked_by`, '$.kind') = 'cold';
