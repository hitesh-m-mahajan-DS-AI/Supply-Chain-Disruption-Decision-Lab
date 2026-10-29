-- Public observations provide an illustrative demand profile, not a forecast.
-- Exact repeat quarantine uses the original eight fields, not source_row.
WITH ranked AS (
  SELECT *, row_number() OVER (
    PARTITION BY InvoiceNo, StockCode, Description, Quantity,
                 InvoiceDate, UnitPrice, CustomerID, Country
    ORDER BY CAST(source_row AS INTEGER)
  ) AS repeat_number FROM raw
)
SELECT StockCode AS sku, min(Description) AS description,
       sum(CAST(Quantity AS INTEGER))::INTEGER AS observed_units
FROM ranked
WHERE repeat_number = 1
  AND upper(InvoiceNo) NOT LIKE 'C%'
  AND CAST(Quantity AS INTEGER) > 0
  AND CAST(UnitPrice AS DOUBLE) > 0
  AND CAST(InvoiceDate AS TIMESTAMP) >= TIMESTAMP '2010-12-01 00:00:00'
  AND CAST(InvoiceDate AS TIMESTAMP) < TIMESTAMP '2010-12-08 00:00:00'
  AND StockCode IN ('84077', '85123A', '21212', '22834', '22197', '85099B')
GROUP BY StockCode ORDER BY StockCode;
